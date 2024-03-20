#!/usr/bin/env node

// A WebSocket to TCP socket proxy
// Copyright 2012 Joel Martin
// Licensed under LGPL version 3 (see docs/LICENSE.LGPL-3)

// Updated to use newer ws and minimist node modules

var argv = require('minimist')(process.argv.slice(2)),
    net = require('net'),

    Buffer = require('buffer').Buffer,
    WebSocketServer = require('ws').Server,

    wsServer,
    source_host, source_port, target_host, target_port;

// The websockifier code has been modified in order to workaround the player connection lock in WebGL (case 759492)
// See the README_UNITY.txt for the details.
// The structure of the player connection message is the following (according to the /Runtime/Network/PlayerCommunicator/GeneralConnection.h) :
//   the message header:
//        UInt32 m_MagicNumber; // in little endian
//        UnityGUID m_MessageId; // in little endian
//        UInt32 m_Size; // in little endian
//   is followed by the message body of m_Size bytes

var PLAYER_MESSAGE_MAGIC_NUMBER = 0x67A54E8F;
var messageHeaderSize = 24;
    
// Handle new WebSocket client
new_client = function(client) {
    var clientAddr = client._socket.remoteAddress, log;
    //console.log(client.upgradeReq.url);
    log = function (msg) {
        console.log(' ' + clientAddr + ': '+ msg);
    };
    log('WebSocket connection');
    log('Version ' + client.protocolVersion + ', subprotocol: ' + client.protocol);

    var target = net.createConnection(target_port,target_host, function() {
        log('connected to target');
        target.message = {
            buffer: Buffer.alloc(messageHeaderSize),
            read: 0,
            size: 0,
        };
    });
    target.on('data', function(data) {
        //log("from socket: " + data.toString('hex'));
        try {
            if (client.protocol === 'base64') {
                client.send(Buffer.from(data).toString('base64'));
            } else {
                var read;
                // The following code splits the incoming data on the message boundaries and sends it to the websocket.
                // Incomplete messages are stored in the buffer.
                for(var position = 0; position < data.length;) {
                    // target.message.size is the total size of the message, including the header and the body.
                    // It is set only after the message header has been received (when set, it is always non-zero, as it includes the header size)
                    if (!target.message.size) {
                        // receiving the message header
                        read = Math.min(data.length - position, messageHeaderSize - target.message.read);
                        if (read) {
                            data.copy(target.message.buffer, target.message.read, position, position + read);
                            position += read;
                            target.message.read += read;
                        }                  
                        if (target.message.read == messageHeaderSize) {
                            // the message header has been received            
                            if (target.message.buffer.readUInt32LE(0) != PLAYER_MESSAGE_MAGIC_NUMBER) { // m_MagicNumber is at offset 0
                                client.destroy();
                                throw 'PLAYER_MESSAGE_MAGIC_NUMBER mismatch';
                            }
                            target.message.size = messageHeaderSize + target.message.buffer.readUInt32LE(20); // m_Size is at offset 20
                            if (target.message.size > target.message.buffer.length) {
                                // reallocate the buffer if the message does not fit
                                var buffer = target.message.buffer;
                                target.message.buffer = Buffer.alloc(target.message.size);
                                buffer.copy(target.message.buffer, 0, 0, target.message.read);
                            }
                        }
                    }
                    if (target.message.size) {
                        // receiving the message body
                        read = Math.min(data.length - position, target.message.size - target.message.read);
                        if (read) {
                            data.copy(target.message.buffer, target.message.read, position, position + read);
                            position += read;
                            target.message.read += read;
                        }
                        if (target.message.read == target.message.size) {
                            //log("send to web: " + target.message.buffer.slice(0, target.message.size).toString('hex'));
                            // the message body has been received
                            client.send(target.message.buffer.slice(0, target.message.size), {binary: true}/*, function(e) {log("to web e = " + e);}*/);
                            target.message.read = target.message.size = 0;
                        }
                    }
                }
            }
        } catch(e) {
            log("Client closed, cleaning up target " + e);
            target.end();
        }
    });
    target.on('end', function() {
        log('target disconnected');
        client.close();
    });
    target.on('error', function() {
        log('target connection error');
        target.end();
        client.close();
    });

    client.on('message', function(msg) {
        //log('from web to socket ' + msg.toString('hex'));
        if (client.protocol === 'base64') {
            target.write(Buffer.from(msg, 'base64'));
        } else {
            target.write(msg, 'binary');
        }
    });
    client.on('close', function(code, reason) {
        log('WebSocket client disconnected: ' + code + ' [' + reason + ']');
        target.end();
    });
    client.on('error', function(a) {
        log('WebSocket client error: ' + a);
        target.end();
    });
};

// Select 'binary' or 'base64' subprotocol, preferring 'binary'
selectProtocol = function(protocols, request) {
    if (protocols.has('binary')) {
        return 'binary';
    } else if (protocols.has('base64')) {
        return 'base64';
    } else {
        console.log("Client must support 'binary' or 'base64' protocol");
        return false;
    }
};

// parse source and target arguments into parts
try {
    source_arg = argv._[0].toString();
    target_arg = argv._[1].toString();

    var idx;
    idx = source_arg.indexOf(":");
    if (idx >= 0) {
        source_host = source_arg.slice(0, idx);
        source_port = parseInt(source_arg.slice(idx+1), 10);
    } else {
        source_host = "";
        source_port = parseInt(source_arg, 10);
    }

    idx = target_arg.indexOf(":");
    if (idx < 0) {
        throw("target must be host:port");
    }
    target_host = target_arg.slice(0, idx);
    target_port = parseInt(target_arg.slice(idx+1), 10);

    if (isNaN(source_port) || isNaN(target_port)) {
        throw("illegal port");
    }
} catch(e) {
    console.error("websockify.js [source_addr:]source_port target_addr:target_port");
    process.exit(2);
}

console.log("Proxying from " + source_host + ":" + source_port +
            " to " + target_host + ":" + target_port);

wsServer = new WebSocketServer({port: source_port,
                                handleProtocols: selectProtocol,
                                perMessageDeflate: false});
wsServer.on('connection', new_client);
