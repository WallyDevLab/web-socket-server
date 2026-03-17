# WebSocket Chat with Username Authentication

A complete real time chat application with separate server and client, featuring username based authentication and duplicate prevention.

## Project Structure

```
websocket-projects/
├── server/              # WebSocket server (Node.js + TypeScript)
│   ├── src/
│   │   └── server.ts   # Server logic
│   ├── package.json
│   └── README.md
│
└── client/              # Web client (HTML/CSS/JS)
    ├── index.html      # Client application
    ├── package.json
    └── README.md
```

## Key Features

✅ **Server:**
- Username validation before connection
- Prevents duplicate usernames
- Tracks all connected users
- Real time message broadcasting
- User join/leave notifications
- RESTful status endpoint
- **Interactive CLI for server management (list, kick, broadcast, etc.)**

✅ **Client:**
- Username prompt before connecting
- Clean, modern chat interface
- Live user list
- Real time messaging
- Error handling for duplicates
- Leave chat button

## Quick Start

**Step 1: Start the Server**
```bash
cd server
npm install
npm run dev
```
Server runs at http://localhost:3000

**Step 2: Start the Client**
```bash
cd client
npm install
npm start
```
Client opens at http://localhost:8080

**Step 3: Chat!**
1. Enter a username
2. Click "Connect"
3. Start sending messages

## How Authentication Works

**Connection Flow:**
```
1. Client connects to WebSocket
2. Client sends: {"type": "auth", "username": "Bob"}
3. Server checks if "Bob" is already connected
4. If unique → Server accepts, client enters chat
5. If duplicate → Server rejects, connection closes
```

**Why This Approach:**
- Username required before any chat activity
- Server controls who can connect
- No anonymous users
- Prevents impersonation (no duplicate names)

## Testing Multiple Users

Open multiple browser tabs and connect with different usernames:
- Tab 1: "Alice"
- Tab 2: "Bob"
- Tab 3: Try "Alice" again → Rejected!

Watch messages broadcast to all connected users in real time.

## Server CLI Commands

The server includes a comprehensive interactive command line interface. While the server is running, type commands in the terminal for complete server control.

**User Management:**
```bash
server> mute Alice          # Prevent user from sending messages
server> unmute Alice        # Allow user to send again
server> kick Bob            # Disconnect a specific user
server> purge               # Disconnect all users
```

**Monitoring & Analytics:**
```bash
server> list                # Show all connected users
server> status              # Server uptime and current state
server> stats               # Detailed statistics (messages, peak users)
server> logs                # Recent connection events
server> history             # Last 100 messages
server> connections         # IP addresses and browser info
```

**Messaging & Communication:**
```bash
server> broadcast <msg>     # Send announcement to all users
server> whisper Alice <msg> # Private admin message to one user
server> announce <msg>      # Recurring announcement (every 5 min)
server> motd <msg>          # Message shown to new users
```

**Server Control:**
```bash
server> hold                # Read only mode (users can't send)
server> unhold              # Resume normal messaging
server> maintenance on      # Block new connections
server> maintenance off     # Allow new connections
server> restart             # Graceful server restart
server> quit                # Shutdown server
```

**Configuration:**
```bash
server> config              # Show all settings
server> set maxUsers 100    # Change max users
server> set messageRateLimit 20  # Messages per minute
server> reload              # Reload configuration
```

All commands provide real time visual feedback and confirmation messages.

## Architecture Highlights

**Separation of Concerns:**
- Server: Pure backend logic, no UI code
- Client: Pure frontend, connects to any compatible server
- Independent deployment and scaling

**TypeScript Server:**
- Type safe code
- Better development experience
- Catches errors at compile time

**Vanilla JS Client:**
- No framework overhead
- Fast and lightweight
- Easy to understand and modify

## Message Protocol

**Client to Server:**
```json
// Authentication
{"type": "auth", "username": "Alice"}

// Regular message
"Hello everyone!"
```

**Server to Client:**
```json
// Auth success
{"type": "auth_success", "message": "Welcome, Alice!", "username": "Alice", "timestamp": "..."}

// Auth error
{"type": "error", "message": "Username 'Alice' is already taken"}

// User joined
{"type": "user_joined", "username": "Bob", "message": "Bob joined the chat", "timestamp": "..."}

// Regular message
{"type": "message", "username": "Alice", "message": "Hello!", "timestamp": "..."}

// User list update
{"type": "user_list", "users": ["Alice", "Bob"], "count": 2, "timestamp": "..."}

// User left
{"type": "user_left", "username": "Bob", "message": "Bob left the chat", "timestamp": "..."}
```

## Development

**Server (TypeScript):**
- Auto restart on file changes with nodemon
- TypeScript compilation on save
- Console logging for all events

**Client (Static HTML):**
- Live reload with http-server
- No build process needed
- Direct file editing

## Next Steps

**Possible Enhancements:**
- Add chat rooms/channels
- Private messages between users
- Message history persistence
- User avatars
- Typing indicators
- Read receipts
- File sharing
- Emoji support
- Mobile app client

## Troubleshooting

**"Connection failed" error:**
- Make sure server is running first
- Check server is on port 3000
- Check client is connecting to correct URL

**"Username already taken" error:**
- Someone else is using that username
- Try a different username
- If you disconnected, wait a moment and retry

**Messages not appearing:**
- Check browser console for errors
- Verify WebSocket connection is open
- Restart both server and client

## License

This is a learning project demonstrating WebSocket authentication patterns. Feel free to use and modify for your own projects.
