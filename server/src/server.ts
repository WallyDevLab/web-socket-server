import 'dotenv/config';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import * as readline from 'readline';
import os from 'os';

// Step 1: Create an Express app
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Step 2: Create an HTTP server
const server = http.createServer(app);

// Step 3: Create a WebSocket server
const wss = new WebSocketServer({ server });

// Step 4: Track connected users and server state
interface User {
  username: string;
  ws: WebSocket;
  connectedAt: Date;
  isMuted: boolean;
  messageCount: number;
  ipAddress: string;
  userAgent: string;
}

interface ConnectionLog {
  timestamp: Date;
  event: string;
  username?: string;
  details?: string;
}

interface ServerStats {
  totalMessagesReceived: number;
  totalMessagesSent: number;
  peakUsers: number;
  totalConnections: number;
  totalDisconnections: number;
}

interface ServerConfig {
  maxUsers: number;
  messageRateLimit: number;
  allowAnonymous: boolean;
  requireAuth: boolean;
}

const connectedUsers = new Map<string, User>();
const mutedUsers = new Set<string>();
const messageHistory: Array<{ username: string; message: string; timestamp: Date }> = [];
const connectionLogs: ConnectionLog[] = [];
const MAX_HISTORY = 100;
const MAX_LOGS = 50;

let serverStats: ServerStats = {
  totalMessagesReceived: 0,
  totalMessagesSent: 0,
  peakUsers: 0,
  totalConnections: 0,
  totalDisconnections: 0
};

let serverConfig: ServerConfig = {
  maxUsers: 50,
  messageRateLimit: 10,
  allowAnonymous: false,
  requireAuth: true
};

let messageOfTheDay: string | null = null;
let maintenanceMode = false;
let holdMode = false;
let announcementInterval: NodeJS.Timeout | null = null;
let announcementMessage: string | null = null;

// Step 5: Handle regular HTTP requests
app.get('/', (req: express.Request, res: express.Response) => {
  res.json({
    message: 'WebSocket server is running',
    endpoint: 'ws://localhost:3000',
    connectedUsers: Array.from(connectedUsers.keys()),
    totalUsers: connectedUsers.size
  });
});

// Step 6: Handle WebSocket connections
wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  const ipAddress = req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  console.log(`New client attempting to connect from ${ipAddress}...`);
  addLog('connection_attempt', undefined, `IP: ${ipAddress}`);
  
  let username: string | null = null;
  let isAuthenticated = false;

  // Listen for the first message (should contain username)
  ws.on('message', (data: Buffer) => {
    const message = data.toString();

    // If not authenticated, expect username
    if (!isAuthenticated) {
      try {
        const authData = JSON.parse(message);
        
        if (authData.type === 'auth' && authData.username) {
          const requestedUsername = authData.username.trim();

          // Validate username
          if (requestedUsername.length === 0) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Username cannot be empty'
            }));
            ws.close();
            return;
          }

          // Check for duplicate username
          if (connectedUsers.has(requestedUsername)) {
            ws.send(JSON.stringify({
              type: 'error',
              message: `Username "${requestedUsername}" is already taken`
            }));
            ws.close();
            return;
          }

          // Username is valid and unique
          username = requestedUsername;
          isAuthenticated = true;

          // Check if server is in maintenance or hold mode
          if (maintenanceMode) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Server is currently in maintenance mode'
            }));
            ws.close();
            return;
          }

          // Add user to connected users
          connectedUsers.set(requestedUsername, {
            username: requestedUsername,
            ws,
            connectedAt: new Date(),
            isMuted: mutedUsers.has(requestedUsername),
            messageCount: 0,
            ipAddress,
            userAgent
          });

          // Update stats
          serverStats.totalConnections++;
          if (connectedUsers.size > serverStats.peakUsers) {
            serverStats.peakUsers = connectedUsers.size;
          }

          console.log(`✅ User "${requestedUsername}" connected`);
          addLog('user_connected', requestedUsername, `IP: ${ipAddress}`);

          // Send success message
          ws.send(JSON.stringify({
            type: 'auth_success',
            message: `Welcome, ${requestedUsername}!`,
            username: requestedUsername,
            timestamp: new Date().toISOString()
          }));

          // Send MOTD if set
          if (messageOfTheDay) {
            ws.send(JSON.stringify({
              type: 'motd',
              message: messageOfTheDay,
              timestamp: new Date().toISOString()
            }));
          }

          // Send hold mode notification if active
          if (holdMode) {
            ws.send(JSON.stringify({
              type: 'hold_mode',
              message: 'Server is currently on hold. You can read messages but cannot send.',
              timestamp: new Date().toISOString()
            }));
          }

          // Notify all other users about new user
          broadcastUserList();
          broadcastMessage({
            type: 'user_joined',
            username: requestedUsername,
            message: `${requestedUsername} joined the chat`,
            timestamp: new Date().toISOString()
          }, requestedUsername);

        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid authentication message'
          }));
          ws.close();
        }
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
        ws.close();
      }
      return;
    }

    // Handle regular messages (after authentication)
    if (isAuthenticated && username) {
      const user = connectedUsers.get(username);
      
      if (!user) return;

      // Check if server is on hold
      if (holdMode) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Server is on hold. Messages are temporarily disabled.'
        }));
        return;
      }

      // Check if user is muted
      if (user.isMuted) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'You are muted and cannot send messages.'
        }));
        return;
      }

      console.log(`${username}: ${message}`);

      // Update user stats
      user.messageCount++;
      serverStats.totalMessagesReceived++;

      // Add to message history
      addToHistory(username, message);

      // Broadcast message to all users
      broadcastMessage({
        type: 'message',
        username: username,
        message: message,
        timestamp: new Date().toISOString()
      });
      
      serverStats.totalMessagesSent += connectedUsers.size;
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    if (username) {
      console.log(`❌ User "${username}" disconnected`);
      connectedUsers.delete(username);
      serverStats.totalDisconnections++;
      addLog('user_disconnected', username);
      
      // Notify remaining users
      broadcastUserList();
      broadcastMessage({
        type: 'user_left',
        username: username,
        message: `${username} left the chat`,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('Unauthenticated client disconnected');
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error${username ? ` (${username})` : ''}:`, error);
  });
});

// Helper function to broadcast messages to all users
function broadcastMessage(data: any, excludeUsername?: string) {
  connectedUsers.forEach((user) => {
    if (excludeUsername && user.username === excludeUsername) {
      return; // Skip this user
    }
    if (user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(JSON.stringify(data));
    }
  });
}

// Helper function to send updated user list to all clients
function broadcastUserList() {
  const usernames = Array.from(connectedUsers.keys());
  const data = {
    type: 'user_list',
    users: usernames,
    count: usernames.length,
    timestamp: new Date().toISOString()
  };
  
  connectedUsers.forEach((user) => {
    if (user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(JSON.stringify(data));
    }
  });
}

// Helper function to add to message history
function addToHistory(username: string, message: string) {
  messageHistory.push({
    username,
    message,
    timestamp: new Date()
  });
  
  // Keep only last MAX_HISTORY messages
  if (messageHistory.length > MAX_HISTORY) {
    messageHistory.shift();
  }
}

// Helper function to add to connection logs
function addLog(event: string, username?: string, details?: string) {
  connectionLogs.push({
    timestamp: new Date(),
    event,
    username,
    details
  });
  
  // Keep only last MAX_LOGS entries
  if (connectionLogs.length > MAX_LOGS) {
    connectionLogs.shift();
  }
}

// Step 7: Start the server
const serverStartTime = new Date();
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket available at ws://localhost:${PORT}`);
  console.log(`👥 Connected users: 0`);
  console.log(`💬 Type 'help' for available commands`);
  console.log('');
});

// Step 8: Setup CLI for server commands
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'server> '
});

// Display prompt
rl.prompt();

rl.on('line', (input: string) => {
  const command = input.trim().toLowerCase();
  const args = input.trim().split(' ');
  
  switch (command) {
    case 'list':
      handleListCommand();
      break;
    
    case 'purge':
      handlePurgeCommand();
      break;
    
    case 'quit':
    case 'exit':
      handleQuitCommand();
      break;
    
    case 'status':
      handleStatusCommand();
      break;
    
    case 'help':
      handleHelpCommand();
      break;
    
    case 'stats':
      handleStatsCommand();
      break;
    
    case 'logs':
      handleLogsCommand();
      break;
    
    case 'history':
      handleHistoryCommand();
      break;
    
    case 'connections':
      handleConnectionsCommand();
      break;
    
    case 'config':
      handleConfigCommand();
      break;
    
    case 'reload':
      handleReloadCommand();
      break;
    
    case 'restart':
      handleRestartCommand();
      break;
    
    case 'hold':
      handleHoldCommand();
      break;
    
    case 'unhold':
      handleUnholdCommand();
      break;
    
    case 'kick':
      console.log('Usage: kick <username>');
      break;
    
    case 'mute':
      console.log('Usage: mute <username>');
      break;
    
    case 'unmute':
      console.log('Usage: unmute <username>');
      break;
    
    case 'whisper':
      console.log('Usage: whisper <username> <message>');
      break;
    
    case 'broadcast':
      console.log('Usage: broadcast <message>');
      break;
    
    case 'announce':
      console.log('Usage: announce <message>');
      break;
    
    case 'motd':
      console.log('Usage: motd <message>');
      break;
    
    case 'set':
      console.log('Usage: set <option> <value>');
      break;
    
    case 'port':
      console.log('Usage: port <number>');
      break;
    
    case 'maintenance':
      console.log('Usage: maintenance on/off');
      break;
    
    case '':
      // Empty command
      break;
    
    default:
      // Multi word commands
      if (command.startsWith('kick ')) {
        handleKickCommand(args.slice(1).join(' '));
      } else if (command.startsWith('mute ')) {
        handleMuteCommand(args.slice(1).join(' '));
      } else if (command.startsWith('unmute ')) {
        handleUnmuteCommand(args.slice(1).join(' '));
      } else if (command.startsWith('broadcast ')) {
        handleBroadcastCommand(input.slice(10).trim());
      } else if (command.startsWith('whisper ')) {
        const parts = input.slice(8).trim().split(' ');
        if (parts.length < 2) {
          console.log('Usage: whisper <username> <message>');
        } else {
          handleWhisperCommand(parts[0], parts.slice(1).join(' '));
        }
      } else if (command.startsWith('announce ')) {
        handleAnnounceCommand(input.slice(9).trim());
      } else if (command.startsWith('motd ')) {
        handleMotdCommand(input.slice(5).trim());
      } else if (command.startsWith('set ')) {
        const parts = args.slice(1);
        if (parts.length < 2) {
          console.log('Usage: set <option> <value>');
        } else {
          handleSetCommand(parts[0], parts.slice(1).join(' '));
        }
      } else if (command.startsWith('port ')) {
        handlePortCommand(args[1]);
      } else if (command.startsWith('maintenance ')) {
        handleMaintenanceCommand(args[1]);
      } else {
        console.log(`Unknown command: ${command}`);
        console.log(`Type 'help' for available commands`);
      }
  }
  
  rl.prompt();
});

// Command handlers
function handleListCommand() {
  console.log('\n📋 Connected Users:');
  console.log('─'.repeat(60));
  
  if (connectedUsers.size === 0) {
    console.log('No users connected');
  } else {
    const users = Array.from(connectedUsers.values());
    users.forEach((user, index) => {
      const connectedDuration = getTimeDifference(user.connectedAt, new Date());
      console.log(`${index + 1}. ${user.username} (connected ${connectedDuration})`);
    });
  }
  
  console.log('─'.repeat(60));
  console.log(`Total: ${connectedUsers.size} user(s)\n`);
}

function handlePurgeCommand() {
  console.log('\n⚠️  Purging all users...');
  
  const count = connectedUsers.size;
  
  if (count === 0) {
    console.log('No users to purge\n');
    return;
  }
  
  // Send disconnect message to all users
  connectedUsers.forEach((user) => {
    try {
      user.ws.send(JSON.stringify({
        type: 'server_shutdown',
        message: 'Server is purging all connections'
      }));
      user.ws.close();
    } catch (error) {
      console.error(`Error disconnecting ${user.username}:`, error);
    }
  });
  
  connectedUsers.clear();
  console.log(`✅ Purged ${count} user(s)\n`);
}

function handleQuitCommand() {
  console.log('\n⚠️  Shutting down server...');
  
  // Notify all users
  if (connectedUsers.size > 0) {
    console.log(`Disconnecting ${connectedUsers.size} user(s)...`);
    connectedUsers.forEach((user) => {
      try {
        user.ws.send(JSON.stringify({
          type: 'server_shutdown',
          message: 'Server is shutting down'
        }));
        user.ws.close();
      } catch (error) {
        console.error(`Error disconnecting ${user.username}:`, error);
      }
    });
  }
  
  // Close server
  server.close(() => {
    console.log('✅ Server shut down successfully');
    process.exit(0);
  });
  
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.log('⚠️  Forcing shutdown...');
    process.exit(0);
  }, 5000);
}

function handleStatusCommand() {
  console.log('\n📊 Server Status:');
  console.log('─'.repeat(60));
  console.log(`Port: ${PORT}`);
  console.log(`Uptime: ${getTimeDifference(serverStartTime, new Date())}`);
  console.log(`Connected Users: ${connectedUsers.size}`);
  console.log(`WebSocket Server: Running`);
  console.log(`HTTP Server: Running`);
  
  if (connectedUsers.size > 0) {
    const usernames = Array.from(connectedUsers.keys()).join(', ');
    console.log(`Active Users: ${usernames}`);
  }
  
  console.log('─'.repeat(60));
  console.log('');
}

function handleHelpCommand() {
  console.log('\n🔧 WebSocket Chat Server');
  console.log('═'.repeat(70));
  console.log('A real time chat server with username authentication');
  console.log(`Currently ${connectedUsers.size} user(s) connected | Maintenance: ${maintenanceMode ? 'ON' : 'OFF'} | Hold: ${holdMode ? 'ON' : 'OFF'}`);
  console.log('');
  console.log('BASIC COMMANDS:');
  console.log('  list                     List all connected users');
  console.log('  status                   Show server status');
  console.log('  stats                    Show detailed statistics');
  console.log('  help                     Show this help message');
  console.log('  quit/exit                Shutdown the server');
  console.log('');
  console.log('USER MANAGEMENT:');
  console.log('  kick <username>          Disconnect a specific user');
  console.log('  mute <username>          Prevent user from sending messages');
  console.log('  unmute <username>        Allow user to send messages');
  console.log('  purge                    Disconnect all users');
  console.log('');
  console.log('MESSAGING:');
  console.log('  broadcast <message>      Send announcement to all users');
  console.log('  whisper <user> <msg>     Send private message to user');
  console.log('  announce <message>       Set recurring announcement (every 5 min)');
  console.log('  motd <message>           Set message of the day');
  console.log('');
  console.log('MONITORING:');
  console.log('  logs                     Show recent connection logs');
  console.log('  history                  Show message history');
  console.log('  connections              Show connection details (IP, browser)');
  console.log('');
  console.log('CONFIGURATION:');
  console.log('  config                   Display current configuration');
  console.log('  set <option> <value>     Change a setting');
  console.log('  port <number>            Change server port (requires restart)');
  console.log('  reload                   Reload configuration');
  console.log('');
  console.log('SERVER CONTROL:');
  console.log('  maintenance on/off       Toggle maintenance mode');
  console.log('  hold                     Put server on hold (no messaging)');
  console.log('  unhold                   Resume normal operation');
  console.log('  restart                  Restart server gracefully');
  console.log('');
  console.log('EXAMPLES:');
  console.log('  kick Alice');
  console.log('  mute Bob');
  console.log('  broadcast Server will restart in 5 minutes');
  console.log('  whisper Alice Please check your messages');
  console.log('  set maxUsers 100');
  console.log('  maintenance on');
  console.log('═'.repeat(70));
  console.log('');
}

function handleKickCommand(username: string) {
  if (!username) {
    console.log('❌ Please specify a username to kick');
    console.log('Usage: kick <username>');
    return;
  }
  
  const user = connectedUsers.get(username);
  
  if (!user) {
    console.log(`❌ User "${username}" not found`);
    console.log('Use "list" to see connected users');
    return;
  }
  
  console.log(`\n⚠️  Kicking user: ${username}`);
  
  try {
    user.ws.send(JSON.stringify({
      type: 'kicked',
      message: 'You have been removed from the server'
    }));
    user.ws.close();
    console.log(`✅ User "${username}" kicked successfully\n`);
  } catch (error) {
    console.error(`❌ Error kicking ${username}:`, error);
  }
}

function handleBroadcastCommand(message: string) {
  if (!message) {
    console.log('❌ Please provide a message to broadcast');
    console.log('Usage: broadcast <message>');
    return;
  }
  
  if (connectedUsers.size === 0) {
    console.log('⚠️  No users connected to receive the broadcast');
    return;
  }
  
  console.log(`\n📢 Broadcasting to ${connectedUsers.size} user(s)...`);
  
  broadcastMessage({
    type: 'server_message',
    message: message,
    timestamp: new Date().toISOString()
  });
  
  console.log(`✅ Broadcast sent: "${message}"\n`);
}

function handleMuteCommand(username: string) {
  if (!username) {
    console.log('❌ Please specify a username to mute');
    return;
  }
  
  const user = connectedUsers.get(username);
  if (!user) {
    console.log(`❌ User "${username}" not found`);
    return;
  }
  
  if (user.isMuted) {
    console.log(`⚠️  User "${username}" is already muted`);
    return;
  }
  
  user.isMuted = true;
  mutedUsers.add(username);
  console.log(`\n🔇 User "${username}" has been muted`);
  
  user.ws.send(JSON.stringify({
    type: 'muted',
    message: 'You have been muted by the server administrator',
    timestamp: new Date().toISOString()
  }));
  
  addLog('user_muted', username);
  console.log('');
}

function handleUnmuteCommand(username: string) {
  if (!username) {
    console.log('❌ Please specify a username to unmute');
    return;
  }
  
  const user = connectedUsers.get(username);
  if (!user) {
    console.log(`❌ User "${username}" not found`);
    return;
  }
  
  if (!user.isMuted) {
    console.log(`⚠️  User "${username}" is not muted`);
    return;
  }
  
  user.isMuted = false;
  mutedUsers.delete(username);
  console.log(`\n🔊 User "${username}" has been unmuted`);
  
  user.ws.send(JSON.stringify({
    type: 'unmuted',
    message: 'You have been unmuted by the server administrator',
    timestamp: new Date().toISOString()
  }));
  
  addLog('user_unmuted', username);
  console.log('');
}

function handleStatsCommand() {
  console.log('\n📊 Server Statistics:');
  console.log('═'.repeat(70));
  console.log(`Total Connections:        ${serverStats.totalConnections}`);
  console.log(`Total Disconnections:     ${serverStats.totalDisconnections}`);
  console.log(`Current Users:            ${connectedUsers.size}`);
  console.log(`Peak Users:               ${serverStats.peakUsers}`);
  console.log(`Messages Received:        ${serverStats.totalMessagesReceived}`);
  console.log(`Messages Sent:            ${serverStats.totalMessagesSent}`);
  console.log(`Muted Users:              ${mutedUsers.size}`);
  console.log(`Messages in History:      ${messageHistory.length}`);
  console.log(`Connection Logs:          ${connectionLogs.length}`);
  console.log(`Server Uptime:            ${getTimeDifference(serverStartTime, new Date())}`);
  
  if (connectedUsers.size > 0) {
    console.log('');
    console.log('Top Messengers:');
    const sorted = Array.from(connectedUsers.values())
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 5);
    sorted.forEach((user, i) => {
      console.log(`  ${i + 1}. ${user.username}: ${user.messageCount} messages`);
    });
  }
  
  console.log('═'.repeat(70));
  console.log('');
}

function handleLogsCommand() {
  console.log('\n📝 Recent Connection Logs:');
  console.log('═'.repeat(70));
  
  if (connectionLogs.length === 0) {
    console.log('No logs available');
  } else {
    connectionLogs.slice().reverse().forEach((log) => {
      const time = log.timestamp.toLocaleTimeString();
      const username = log.username || 'N/A';
      const details = log.details || '';
      console.log(`[${time}] ${log.event.toUpperCase()}: ${username} ${details}`);
    });
  }
  
  console.log('═'.repeat(70));
  console.log('');
}

function handleHistoryCommand() {
  console.log('\n💬 Message History:');
  console.log('═'.repeat(70));
  
  if (messageHistory.length === 0) {
    console.log('No message history available');
  } else {
    messageHistory.forEach((msg) => {
      const time = msg.timestamp.toLocaleTimeString();
      console.log(`[${time}] ${msg.username}: ${msg.message}`);
    });
  }
  
  console.log('═'.repeat(70));
  console.log(`Total: ${messageHistory.length} message(s) (showing last ${MAX_HISTORY})`);
  console.log('');
}

function handleConnectionsCommand() {
  console.log('\n🔌 Active Connections:');
  console.log('═'.repeat(70));
  
  if (connectedUsers.size === 0) {
    console.log('No active connections');
  } else {
    Array.from(connectedUsers.values()).forEach((user, index) => {
      const duration = getTimeDifference(user.connectedAt, new Date());
      console.log(`${index + 1}. ${user.username}`);
      console.log(`   IP Address:  ${user.ipAddress}`);
      console.log(`   User Agent:  ${user.userAgent.substring(0, 60)}${user.userAgent.length > 60 ? '...' : ''}`);
      console.log(`   Connected:   ${duration} ago`);
      console.log(`   Messages:    ${user.messageCount}`);
      console.log(`   Status:      ${user.isMuted ? 'MUTED' : 'Active'}`);
      console.log('');
    });
  }
  
  console.log('═'.repeat(70));
  console.log('');
}

function handleWhisperCommand(username: string, message: string) {
  if (!username || !message) {
    console.log('❌ Usage: whisper <username> <message>');
    return;
  }
  
  const user = connectedUsers.get(username);
  if (!user) {
    console.log(`❌ User "${username}" not found`);
    return;
  }
  
  console.log(`\n💬 Whispering to ${username}...`);
  
  user.ws.send(JSON.stringify({
    type: 'whisper',
    message: message,
    timestamp: new Date().toISOString()
  }));
  
  console.log(`✅ Whisper sent: "${message}"\n`);
  addLog('whisper_sent', username, message);
}

function handleAnnounceCommand(message: string) {
  if (!message) {
    console.log('❌ Please provide an announcement message');
    return;
  }
  
  // Clear existing announcement if any
  if (announcementInterval) {
    clearInterval(announcementInterval);
    console.log('⚠️  Clearing previous announcement');
  }
  
  announcementMessage = message;
  
  // Send immediately
  console.log(`\n📢 Setting recurring announcement...`);
  handleBroadcastCommand(message);
  
  // Set up interval (every 5 minutes)
  announcementInterval = setInterval(() => {
    if (connectedUsers.size > 0) {
      broadcastMessage({
        type: 'server_message',
        message: announcementMessage!,
        timestamp: new Date().toISOString()
      });
      console.log(`[AUTO] Announcement sent: "${announcementMessage}"`);
    }
  }, 5 * 60 * 1000);
  
  console.log('✅ Announcement will repeat every 5 minutes');
  console.log('💡 Use "announce" with no message to stop\n');
}

function handleMotdCommand(message: string) {
  if (!message) {
    messageOfTheDay = null;
    console.log('\n✅ Message of the day cleared\n');
    return;
  }
  
  messageOfTheDay = message;
  console.log(`\n✅ Message of the day set: "${message}"`);
  console.log('💡 New users will see this message on connect\n');
}

function handleSetCommand(option: string, value: string) {
  if (!option || !value) {
    console.log('❌ Usage: set <option> <value>');
    console.log('\nAvailable options:');
    console.log('  maxUsers           Maximum number of users');
    console.log('  messageRateLimit   Messages per minute limit');
    console.log('  allowAnonymous     Allow anonymous connections (true/false)');
    console.log('  requireAuth        Require authentication (true/false)');
    return;
  }
  
  switch (option.toLowerCase()) {
    case 'maxusers':
      const max = parseInt(value);
      if (isNaN(max) || max < 1) {
        console.log('❌ Invalid value. Must be a number greater than 0');
        return;
      }
      serverConfig.maxUsers = max;
      console.log(`\n✅ Max users set to ${max}\n`);
      break;
    
    case 'messageratelimit':
      const rate = parseInt(value);
      if (isNaN(rate) || rate < 1) {
        console.log('❌ Invalid value. Must be a number greater than 0');
        return;
      }
      serverConfig.messageRateLimit = rate;
      console.log(`\n✅ Message rate limit set to ${rate} per minute\n`);
      break;
    
    case 'allowanonymous':
      if (value !== 'true' && value !== 'false') {
        console.log('❌ Value must be "true" or "false"');
        return;
      }
      serverConfig.allowAnonymous = value === 'true';
      console.log(`\n✅ Allow anonymous set to ${value}\n`);
      break;
    
    case 'requireauth':
      if (value !== 'true' && value !== 'false') {
        console.log('❌ Value must be "true" or "false"');
        return;
      }
      serverConfig.requireAuth = value === 'true';
      console.log(`\n✅ Require auth set to ${value}\n`);
      break;
    
    default:
      console.log(`❌ Unknown option: ${option}`);
      console.log('Use "set" with no arguments to see available options');
  }
}

function handleConfigCommand() {
  console.log('\n⚙️  Server Configuration:');
  console.log('═'.repeat(70));
  console.log(`Max Users:           ${serverConfig.maxUsers}`);
  console.log(`Message Rate Limit:  ${serverConfig.messageRateLimit} per minute`);
  console.log(`Allow Anonymous:     ${serverConfig.allowAnonymous}`);
  console.log(`Require Auth:        ${serverConfig.requireAuth}`);
  console.log(`Maintenance Mode:    ${maintenanceMode ? 'ON' : 'OFF'}`);
  console.log(`Hold Mode:           ${holdMode ? 'ON' : 'OFF'}`);
  console.log(`MOTD Set:            ${messageOfTheDay ? 'YES' : 'NO'}`);
  console.log(`Auto Announcement:   ${announcementMessage ? 'YES' : 'NO'}`);
  console.log(`Server Port:         ${PORT}`);
  console.log('═'.repeat(70));
  console.log('');
}

function handleReloadCommand() {
  console.log('\n🔄 Reloading configuration...');
  // In a real implementation, this would reload from a config file
  console.log('✅ Configuration reloaded');
  console.log('💡 Note: This is a placeholder. Implement file loading as needed\n');
}

function handlePortCommand(portStr: string) {
  const newPort = parseInt(portStr);
  if (isNaN(newPort) || newPort < 1 || newPort > 65535) {
    console.log('❌ Invalid port number. Must be between 1 and 65535');
    return;
  }
  
  console.log(`\n⚠️  Port change requires server restart`);
  console.log(`Current port: ${PORT}`);
  console.log(`New port will be: ${newPort}`);
  console.log('💡 Implement this by changing PORT variable and restarting\n');
}

function handleRestartCommand() {
  console.log('\n🔄 Restarting server...');
  console.log('⚠️  Note: This is a simulated restart');
  console.log('💡 In production, use a process manager like PM2 for true restarts');
  
  // Notify all users
  broadcastMessage({
    type: 'server_message',
    message: 'Server is restarting. Please reconnect in a moment.',
    timestamp: new Date().toISOString()
  });
  
  console.log('✅ Restart notification sent to all users\n');
}

function handleMaintenanceCommand(mode: string) {
  if (mode !== 'on' && mode !== 'off') {
    console.log('❌ Usage: maintenance on/off');
    return;
  }
  
  maintenanceMode = mode === 'on';
  
  if (maintenanceMode) {
    console.log('\n🚧 Maintenance mode ENABLED');
    console.log('⚠️  New connections will be rejected');
    
    broadcastMessage({
      type: 'maintenance_mode',
      message: 'Server is entering maintenance mode',
      timestamp: new Date().toISOString()
    });
  } else {
    console.log('\n✅ Maintenance mode DISABLED');
    console.log('👍 New connections are now allowed');
  }
  
  console.log('');
}

function handleHoldCommand() {
  if (holdMode) {
    console.log('⚠️  Server is already on hold\n');
    return;
  }
  
  holdMode = true;
  console.log('\n⏸️  Server is now on HOLD');
  console.log('📢 Users can see messages but cannot send new ones');
  
  broadcastMessage({
    type: 'hold_mode',
    message: 'Server is on hold. You can read messages but cannot send new ones.',
    timestamp: new Date().toISOString()
  });
  
  addLog('hold_mode_enabled');
  console.log('');
}

function handleUnholdCommand() {
  if (!holdMode) {
    console.log('⚠️  Server is not on hold\n');
    return;
  }
  
  holdMode = false;
  console.log('\n▶️  Server hold RELEASED');
  console.log('💬 Users can now send messages again');
  
  broadcastMessage({
    type: 'unhold_mode',
    message: 'Server hold has been released. You can now send messages again.',
    timestamp: new Date().toISOString()
  });
  
  addLog('hold_mode_disabled');
  console.log('');
}

// Helper function to calculate time differences
function getTimeDifference(start: Date, end: Date): string {
  const diff = end.getTime() - start.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
