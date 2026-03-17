# WebSocket Chat Client

A web based client for connecting to the WebSocket chat server with username authentication.

## Features

- 🔐 Username authentication before connecting
- 💬 Real time messaging
- 👥 Live user list showing who's online
- 🚫 Prevents duplicate usernames
- 🚪 Leave chat button for graceful disconnection
- ✨ Clean, modern interface
- 📱 Responsive design

## How It Works

**Step 1: Enter Username**
- Client prompts for username
- Validates username is not empty
- No connection until username is provided

**Step 2: Connect to Server**
- Client creates WebSocket connection
- Sends authentication message: `{"type": "auth", "username": "YourName"}`
- Waits for server response

**Step 3: Server Validates**
- ✅ If username is unique: Server sends `auth_success`, client enters chat
- ❌ If username is taken: Server sends `error`, connection closes

**Step 4: Chat**
- Send messages to all connected users
- See who joins and leaves
- View list of online users

## Running the Client

```bash
# Install dependencies
npm install

# Start the client (opens browser automatically)
npm start
```

The client will open at http://localhost:8080

**Important:** Make sure the server is running first!

## Usage

1. Start the server in the `../server` directory
2. Start this client with `npm start`
3. Enter a username when prompted
4. Click "Connect"
5. Start chatting!
6. Click "Leave Chat" button to disconnect gracefully

**Ways to leave the chat:**
- Click the "Leave Chat" button in the header (asks for confirmation)
- Close the browser tab (automatic disconnect)
- Lose network connection (automatic disconnect)

## Testing Multiple Users

Open multiple browser tabs to http://localhost:8080 and connect with different usernames to simulate multiple users.

## Message Flow

```
User enters username → Client connects → Server validates → Chat begins

Client                    Server
  |                         |
  |---- WebSocket open ---->|
  |                         |
  |-- {"type":"auth"} ----->|
  |     "username":"Bob"    |
  |                         |
  |<-- auth_success --------|  (if unique)
  |   or error -------------|  (if duplicate)
  |                         |
  |-- "Hello!" ------------>|
  |                         |
  |<-- broadcast ---------->| (to all users)
```

## Error Handling

**Duplicate Username:**
- Error message displayed
- Connection closed
- User can try again with different name

**Connection Lost:**
- Alert shown to user
- Page refresh required to reconnect

**Server Offline:**
- Connection error displayed
- User can retry after starting server

## Customization

**Change server URL:**
Edit line 180 in `index.html`:
```javascript
ws = new WebSocket('ws://localhost:3000');
```

**Change client port:**
Edit the start script in `package.json`:
```json
"start": "http-server . -p 8080 -o"
```

## Project Structure

```
client/
├── index.html          # Complete client application
├── package.json        # Dependencies and scripts
└── README.md          # This file
```

## Technical Details

**No build process needed** - This is pure HTML/CSS/JavaScript. The http-server just serves the static file.

**WebSocket lifecycle:**
1. User enters username
2. `new WebSocket()` creates connection
3. `onopen` → Send auth message
4. `onmessage` → Handle server responses
5. `onclose` → Clean up or show error

**Security note:** This is a basic example. For production:
- Use WSS (encrypted WebSocket)
- Add rate limiting
- Sanitize all user input
- Add proper error handling
- Implement reconnection logic
