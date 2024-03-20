March 2022: websockify updated to use newer ws node package

The websockify.js has been modified in order to workaround the player connection lock in WebGL (case 759492)

Specifically, GeneralConnection::Connection::ReceiveMessage is trying to poll the whole message as soon as the message header arrives on the socket.
This code would block in a single-threaded event-driven environment if the rest of the message has not yet arrived,
as the received data is acquired through an intermediate buffer which can only be fed additional data when ReceiveMessage exits.
The workaround for that would be to split the data on the message boundaries in the websockifier before packing into websocket packets,
this way a message will always appear complete in the intermediate buffer so the lock will not occur.

A more general fix for the issue will be introduced later, specifically, the GeneralConnection::Connection::ReceiveMessage should basically
do the very same thing, i.e. buffer an incomplete message and exit immediately.

Note: the fix makes websockify.js unsuitable for any other purpose except proxying the player connection

Note: upgrading websockify.js to a new version will override this fix
