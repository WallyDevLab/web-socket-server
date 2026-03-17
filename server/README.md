# WebSocket Server with Username Authentication

A real time WebSocket server with username based authentication, duplicate prevention, and interactive CLI for server management.

## Key Features

- ✅ Username authentication before connection
- ✅ Prevents duplicate usernames
- ✅ Tracks all connected users
- ✅ Broadcasts user join/leave events
- ✅ Real time message broadcasting
- ✅ User presence list
- ✅ **Interactive CLI for server management**

## Server Management CLI

The server includes an interactive command line interface for real time server management. Simply type commands in the terminal where the server is running.

### Available Commands

**Basic Commands:**
- `list` - List all connected users with connection duration
- `status` - Show server statistics (uptime, users, port)
- `help` - Display command help and server info
- `purge` - Disconnect all users
- `quit` / `exit` - Gracefully shutdown the server

**Advanced Commands:**
- `kick <username>` - Disconnect a specific user
- `broadcast <message>` - Send announcement to all users

### Command Examples

```bash
server> list
📋 Connected Users:
────────────────────────────────────────────────────────────
1. Alice (connected 5m 23s)
2. Bob (connected 2m 10s)
────────────────────────────────────────────────────────────
Total: 2 user(s)

server> status
📊 Server Status:
────────────────────────────────────────────────────────────
Port: 3000
Uptime: 1h 45m
Connected Users: 2
WebSocket Server: Running
HTTP Server: Running
Active Users: Alice, Bob
────────────────────────────────────────────────────────────

server> broadcast Server maintenance in 10 minutes
📢 Broadcasting to 2 user(s)...
✅ Broadcast sent: "Server maintenance in 10 minutes"

server> kick Bob
⚠️  Kicking user: Bob
✅ User "Bob" kicked successfully

server> quit
⚠️  Shutting down server...
Disconnecting 1 user(s)...
✅ Server shut down successfully
```

### More Command Examples

**Muting and unmuting users:**
```bash
server> mute Alice
🔇 User "Alice" has been muted
# Alice can read messages but cannot send

server> unmute Alice
🔊 User "Alice" has been unmuted
```

**Statistics and monitoring:**
```bash
server> stats
📊 Server Statistics:
══════════════════════════════════════════════════════════════════════
Total Connections:        15
Current Users:            3
Peak Users:               8
Messages Received:        142
Messages Sent:            426
Server Uptime:            2h 15m

Top Messengers:
  1. Alice: 45 messages
  2. Bob: 32 messages
  3. Charlie: 18 messages
══════════════════════════════════════════════════════════════════════

server> logs
📝 Recent Connection Logs:
══════════════════════════════════════════════════════════════════════
[10:45:23] USER_CONNECTED: Alice IP: 192.168.1.5
[10:47:12] USER_MUTED: Bob
[10:50:01] USER_DISCONNECTED: Charlie
══════════════════════════════════════════════════════════════════════

server> history
💬 Message History:
══════════════════════════════════════════════════════════════════════
[10:45:30] Alice: Hello everyone!
[10:45:45] Bob: Hi Alice!
[10:46:12] Alice: How is everyone doing?
══════════════════════════════════════════════════════════════════════

server> connections
🔌 Active Connections:
══════════════════════════════════════════════════════════════════════
1. Alice
   IP Address:  192.168.1.5
   User Agent:  Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0
   Connected:   15m 23s ago
   Messages:    45
   Status:      Active
══════════════════════════════════════════════════════════════════════
```

**Messaging features:**
```bash
server> whisper Alice Please check your private messages
💬 Whispering to Alice...
✅ Whisper sent: "Please check your private messages"
# Only Alice receives this message

server> announce Server will restart at midnight for updates
📢 Setting recurring announcement...
📢 Broadcasting to 3 user(s)...
✅ Broadcast sent: "Server will restart at midnight for updates"
✅ Announcement will repeat every 5 minutes
💡 Use "announce" with no message to stop
# Announcement repeats automatically every 5 minutes

server> motd Welcome to our chat server! Be respectful to others.
✅ Message of the day set: "Welcome to our chat server! Be respectful to others."
💡 New users will see this message on connect
```

**Server control:**
```bash
server> hold
⏸️  Server is now on HOLD
📢 Users can see messages but cannot send new ones
# Users receive notification and input is disabled

server> unhold
▶️  Server hold RELEASED
💬 Users can now send messages again

server> maintenance on
🚧 Maintenance mode ENABLED
⚠️  New connections will be rejected
# Existing users stay connected, but no new users can join

server> maintenance off
✅ Maintenance mode DISABLED
👍 New connections are now allowed
```

**Configuration:**
```bash
server> config
⚙️  Server Configuration:
══════════════════════════════════════════════════════════════════════
Max Users:           50
Message Rate Limit:  10 per minute
Allow Anonymous:     false
Require Auth:        true
Maintenance Mode:    OFF
Hold Mode:           OFF
MOTD Set:            YES
Auto Announcement:   YES
Server Port:         3000
══════════════════════════════════════════════════════════════════════

server> set maxUsers 100
✅ Max users set to 100

server> set messageRateLimit 20
✅ Message rate limit set to 20 per minute
```

## How It Works

**Connection Flow:**
1. Client connects to WebSocket
2. Client sends username in first message
3. Server validates username (not empty, not duplicate)
4. Server accepts or rejects connection
5. If accepted, client can send/receive messages

**Message Types:**

**From Client to Server:**
```json
{
  "type": "auth",
  "username": "John"
}
```

**From Server to Client:**
```json
// Success
{
  "type": "auth_success",
  "message": "Welcome, John!",
  "username": "John",
  "timestamp": "2024-03-17T10:30:00Z"
}

// Error (duplicate username)
{
  "type": "error",
  "message": "Username 'John' is already taken"
}

// User joined
{
  "type": "user_joined",
  "username": "Jane",
  "message": "Jane joined the chat",
  "timestamp": "2024-03-17T10:31:00Z"
}

// Regular message
{
  "type": "message",
  "username": "John",
  "message": "Hello everyone!",
  "timestamp": "2024-03-17T10:32:00Z"
}

// User list update
{
  "type": "user_list",
  "users": ["John", "Jane", "Bob"],
  "count": 3,
  "timestamp": "2024-03-17T10:33:00Z"
}

// User left
{
  "type": "user_left",
  "username": "Bob",
  "message": "Bob left the chat",
  "timestamp": "2024-03-17T10:34:00Z"
}
```

## Running the Server

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## API Endpoints

**GET /**
Returns server status and connected users:
```json
{
  "message": "WebSocket server is running",
  "endpoint": "ws://localhost:3000",
  "connectedUsers": ["John", "Jane"],
  "totalUsers": 2
}
```

## Project Structure

```
server/
├── src/
│   └── server.ts          # Main server with auth logic
├── package.json
├── tsconfig.json
└── README.md
```

## Technical Details

**User Tracking:**
- Server maintains a Map of username → User object
- Each User object contains: username, WebSocket connection, connection time
- When user disconnects, they are removed from the Map

**Duplicate Prevention:**
- Before accepting connection, server checks if username exists in Map
- If exists: Send error message and close connection
- If unique: Accept connection and add to Map

**Broadcasting:**
- Messages sent to all connected users
- User list updates sent when users join/leave
- Excludes sender from certain broadcasts (like "user joined")

## Next Steps

This server is ready to connect with any WebSocket client that implements the authentication flow.
