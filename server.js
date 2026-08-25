require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");

const ChatUser = require("./models/ChatUser");

const app = express();

// =====================================================
// IMPORTANT FOR SPACESHIP
// =====================================================

app.set("trust proxy", 1);

const server = http.createServer(app);

// =====================================================
// SOCKET.IO
// =====================================================

const io = new Server(server, {
    cors: {
        origin: true,
        methods: ["GET", "POST"],
        credentials: true
    },

    transports: ["websocket", "polling"]
});

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================================
// PUBLIC DIRECTORY
// =====================================================

const publicPath = path.join(__dirname, "public");

app.use(express.static(publicPath));

// =====================================================
// HOME PAGE
// =====================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(publicPath, "index.html")
    );

});

// =====================================================
// ADMIN PAGE
// =====================================================

app.get("/admin", (req, res) => {

    res.sendFile(
        path.join(publicPath, "admin.html")
    );

});

// =====================================================
// TEST
// =====================================================

app.get("/test", (req, res) => {

    res.json({
        success: true,
        message: "Node.js application is running",
        environment: process.env.NODE_ENV || "development"
    });

});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/health", (req, res) => {

    res.json({

        status: "OK",

        mongodb:
            mongoose.connection.readyState === 1
                ? "connected"
                : "disconnected",

        uptime: process.uptime()

    });

});

// =====================================================
// MONGODB
// =====================================================

async function connectMongoDB() {

    try {

        if (!process.env.MONGO_URI) {

            throw new Error(
                "MONGO_URI is missing"
            );

        }

        console.log("Connecting to MongoDB...");

        await mongoose.connect(
            process.env.MONGO_URI
        );

        console.log(
            "MongoDB connected successfully"
        );

    } catch (error) {

        console.error(
            "MongoDB connection error:",
            error.message
        );

    }

}

// =====================================================
// MONGODB EVENTS
// =====================================================

mongoose.connection.on(
    "connected",
    () => {

        console.log(
            "MongoDB connection established"
        );

    }
);

mongoose.connection.on(
    "error",
    (error) => {

        console.error(
            "MongoDB error:",
            error.message
        );

    }
);

mongoose.connection.on(
    "disconnected",
    () => {

        console.log(
            "MongoDB disconnected"
        );

    }
);

// =====================================================
// ONLINE USERS
// =====================================================

const onlineUsers = {};

// =====================================================
// SOCKET CONNECTION
// =====================================================

io.on("connection", (socket) => {

    console.log(
        "Socket connected:",
        socket.id
    );

    // =================================================
    // USER JOIN
    // =================================================

    socket.on(
        "user_join",
        async (data) => {

            try {

                if (!data) {
                    return;
                }

                const userId = data.userId;
                const mobile = data.mobile;

                if (!userId || !mobile) {

                    console.log(
                        "Invalid user data"
                    );

                    return;
                }

                // =====================================
                // SAVE ONLINE USER
                // =====================================

                onlineUsers[socket.id] = {

                    userId: userId,

                    mobile: mobile

                };

                // =====================================
                // USER ROOM
                // =====================================

                socket.join(userId);

                // =====================================
                // FIND USER
                // =====================================

                let user =
                    await ChatUser.findOne({
                        userId: userId
                    });

                // =====================================
                // USER NOT FOUND
                // =====================================

                if (!user) {

                    user =
                        await ChatUser.findOne({
                            mobile: mobile
                        });

                    // =================================
                    // CREATE USER
                    // =================================

                    if (!user) {

                        user =
                            await ChatUser.create({

                                userId: userId,

                                mobile: mobile,

                                messages: []

                            });

                        console.log(
                            "New user created:",
                            userId
                        );

                    }

                    // =================================
                    // EXISTING MOBILE
                    // =================================

                    else {

                        onlineUsers[
                            socket.id
                        ].userId = user.userId;

                        socket.join(
                            user.userId
                        );

                    }

                }

                // =====================================
                // SEND CHAT HISTORY
                // =====================================

                socket.emit(
                    "chat_history",
                    {

                        userId: user.userId,

                        mobile: user.mobile,

                        messages:
                            user.messages || []

                    }
                );

                // =====================================
                // NOTIFY ADMIN
                // =====================================

                io.emit(
                    "new_user_connected",
                    {

                        userId: user.userId,

                        mobile: user.mobile

                    }
                );

                console.log(
                    "User joined:",
                    user.userId,
                    user.mobile
                );

            } catch (error) {

                console.error(
                    "User join error:",
                    error
                );

            }

        }
    );

    // =================================================
    // USER MESSAGE
    // =================================================

    socket.on(
        "send_user_message",
        async (data) => {

            try {

                const onlineUser =
                    onlineUsers[socket.id];

                if (!onlineUser) {
                    return;
                }

                if (!data || !data.message) {
                    return;
                }

                const newMessage = {

                    sender: "user",

                    message: data.message,

                    time: new Date()

                };

                await ChatUser.findOneAndUpdate(

                    {
                        userId:
                            onlineUser.userId
                    },

                    {
                        $push: {
                            messages:
                                newMessage
                        }
                    }

                );

                // ================================
                // SEND TO ADMIN
                // ================================

                io.emit(
                    "admin_receive_message",
                    {

                        userId:
                            onlineUser.userId,

                        mobile:
                            onlineUser.mobile,

                        message:
                            data.message,

                        time:
                            new Date().toLocaleTimeString(
                                [],
                                {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                }
                            )

                    }
                );

            } catch (error) {

                console.error(
                    "User message error:",
                    error
                );

            }

        }
    );

    // =================================================
    // ADMIN REPLY
    // =================================================

    socket.on(
        "admin_send_reply",
        async (data) => {

            try {

                if (!data) {
                    return;
                }

                const userId =
                    data.userId;

                if (!userId || !data.message) {
                    return;
                }

                const newMessage = {

                    sender: "admin",

                    message: data.message,

                    time: new Date()

                };

                // ================================
                // SAVE MESSAGE
                // ================================

                await ChatUser.findOneAndUpdate(

                    {
                        userId: userId
                    },

                    {
                        $push: {
                            messages:
                                newMessage
                        }
                    }

                );

                // ================================
                // SEND TO USER
                // ================================

                io.to(userId).emit(
                    "user_receive_message",
                    {

                        message:
                            data.message,

                        time:
                            new Date().toLocaleTimeString(
                                [],
                                {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                }
                            )

                    }
                );

                // ================================
                // ADMIN UPDATE
                // ================================

                io.emit(
                    "admin_reply_saved",
                    {

                        userId:
                            userId,

                        message:
                            data.message

                    }
                );

            } catch (error) {

                console.error(
                    "Admin reply error:",
                    error
                );

            }

        }
    );

    // =================================================
    // DISCONNECT
    // =================================================

    socket.on(
        "disconnect",
        (reason) => {

            if (onlineUsers[socket.id]) {

                console.log(
                    "User disconnected:",
                    onlineUsers[socket.id].userId,
                    reason
                );

                delete onlineUsers[socket.id];

            }

        }
    );

});

// =====================================================
// GET ALL USERS
// =====================================================

app.get(
    "/api/chat-users",
    async (req, res) => {

        try {

            const users =
                await ChatUser.find()
                    .sort({
                        updatedAt: -1
                    });

            res.json(users);

        } catch (error) {

            console.error(
                "Get users error:",
                error
            );

            res.status(500).json({

                error:
                    "Unable to load users"

            });

        }

    }
);

// =====================================================
// GET SINGLE USER
// =====================================================

app.get(
    "/api/chat-users/:userId",
    async (req, res) => {

        try {

            const user =
                await ChatUser.findOne({

                    userId:
                        req.params.userId

                });

            if (!user) {

                return res.status(404).json({

                    error:
                        "User not found"

                });

            }

            res.json(user);

        } catch (error) {

            console.error(
                "Chat history error:",
                error
            );

            res.status(500).json({

                error:
                    "Unable to load chat history"

            });

        }

    }
);

// =====================================================
// 404
// =====================================================

app.use(
    (req, res) => {

        res.status(404).json({

            error:
                "Page not found",

            path:
                req.originalUrl

        });

    }
);

// =====================================================
// PORT
// =====================================================

// IMPORTANT:
// Spaceship/Passenger provides PORT.
// Do not hard-code the domain here.

const PORT =
    process.env.PORT || 3000;

// =====================================================
// START SERVER
// =====================================================

async function startServer() {

    await connectMongoDB();

    server.listen(
        PORT,
        "0.0.0.0",
        () => {

            console.log(
                "================================"
            );

            console.log(
                "NODE.JS SERVER STARTED"
            );

            console.log(
                "PORT:",
                PORT
            );

            console.log(
                "HOST: 0.0.0.0"
            );

            console.log(
                "================================"
            );

        }
    );

}

startServer();

// =====================================================
// SHUTDOWN
// =====================================================

process.on(
    "SIGTERM",
    async () => {

        console.log(
            "SIGTERM received"
        );

        server.close(
            async () => {

                await mongoose.connection.close();

                process.exit(0);

            }
        );

    }
);

process.on(
    "SIGINT",
    async () => {

        console.log(
            "SIGINT received"
        );

        server.close(
            async () => {

                await mongoose.connection.close();

                process.exit(0);

            }
        );

    }
);