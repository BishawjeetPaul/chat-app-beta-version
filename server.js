require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");
const crypto = require("crypto");

const ChatUser = require("./models/chatUser");

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
    credentials: true,
  },

  transports: ["websocket", "polling"],
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
  res.sendFile(path.join(publicPath, "index.html"));
});

// =====================================================
// ADMIN PAGE
// =====================================================

app.get("/admin", (req, res) => {
  res.sendFile(path.join(publicPath, "admin.html"));
});

// =====================================================
// TEST
// =====================================================

app.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Node.js application is running",
    environment: process.env.NODE_ENV || "development",
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

    uptime: process.uptime(),
  });
});

// =====================================================
// MONGODB
// =====================================================

async function connectMongoDB() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing");
    }

    console.log("Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error(
      "MongoDB connection error:",
      error.message
    );

    throw error;
  }
}

// =====================================================
// MONGODB EVENTS
// =====================================================

mongoose.connection.on("connected", () => {
  console.log("MongoDB connection established");
});

mongoose.connection.on("error", (error) => {
  console.error(
    "MongoDB error:",
    error.message
  );
});

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected");
});

// =====================================================
// MOBILE NUMBER VALIDATION
// =====================================================

function normalizeMobile(mobile) {
  if (!mobile) {
    return null;
  }

  // Convert to string
  mobile = String(mobile).trim();

  // Remove spaces, +, -, brackets etc.
  mobile = mobile.replace(/\D/g, "");

  // If India country code is supplied
  // +91XXXXXXXXXX -> 91XXXXXXXXXX
  // Convert it to 10-digit number
  if (mobile.length === 12 && mobile.startsWith("91")) {
    mobile = mobile.substring(2);
  }

  // Must be exactly 10 digits
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    return null;
  }

  return mobile;
}

// =====================================================
// GENERATE USER ID
// =====================================================

function generateUserId() {
  return crypto.randomUUID();
}

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

  // ===================================================
  // USER JOIN / MOBILE VERIFICATION
  // ===================================================

  socket.on("user_join", async (data) => {
    try {
      console.log(
        "User join request:",
        data
      );

      if (!data) {
        socket.emit("mobile_verification_error", {
          success: false,
          message: "Mobile number is required",
        });

        return;
      }

      // =================================================
      // GET MOBILE NUMBER
      // =================================================

      const mobile = normalizeMobile(
        data.mobile
      );

      // =================================================
      // VALIDATE MOBILE
      // =================================================

      if (!mobile) {
        socket.emit(
          "mobile_verification_error",
          {
            success: false,
            message:
              "Please enter a valid 10-digit mobile number",
          }
        );

        return;
      }

      console.log(
        "Checking mobile number:",
        mobile
      );

      // =================================================
      // IMPORTANT
      //
      // DO NOT TRUST userId FROM FRONTEND
      //
      // We identify the user ONLY by mobile number.
      // =================================================

      let user = await ChatUser.findOne({
        mobile: mobile,
      });

      // =================================================
      // EXISTING USER
      // =================================================

      if (user) {
        console.log(
          "Existing user found:",
          user.userId,
          mobile
        );

        // ===============================================
        // SAVE ONLINE USER
        // ===============================================

        onlineUsers[socket.id] = {
          userId: user.userId,
          mobile: user.mobile,
        };

        // ===============================================
        // JOIN EXISTING USER ROOM
        // ===============================================

        socket.join(user.userId);

        // ===============================================
        // SEND EXISTING CHAT HISTORY
        // ===============================================

        socket.emit("mobile_verified", {
          success: true,

          existingUser: true,

          userId: user.userId,

          mobile: user.mobile,

          messages: user.messages || [],
        });

        // ===============================================
        // SEND CHAT HISTORY
        // ===============================================

        socket.emit("chat_history", {
          userId: user.userId,

          mobile: user.mobile,

          messages: user.messages || [],
        });

        // ===============================================
        // NOTIFY ADMIN
        // ===============================================

        io.emit("new_user_connected", {
          userId: user.userId,

          mobile: user.mobile,

          existingUser: true,
        });

        console.log(
          "Existing user verified:",
          user.userId,
          user.mobile
        );

        return;
      }

      // =================================================
      // NEW USER
      // =================================================

      console.log(
        "Mobile number not found. Creating new user..."
      );

      // =================================================
      // SERVER GENERATES USER ID
      // =================================================

      const newUserId = generateUserId();

      // =================================================
      // CREATE NEW USER
      // =================================================

      user = await ChatUser.create({
        userId: newUserId,

        mobile: mobile,

        messages: [],
      });

      console.log(
        "New user created:",
        user.userId,
        user.mobile
      );

      // =================================================
      // SAVE ONLINE USER
      // =================================================

      onlineUsers[socket.id] = {
        userId: user.userId,

        mobile: user.mobile,
      };

      // =================================================
      // JOIN NEW USER ROOM
      // =================================================

      socket.join(user.userId);

      // =================================================
      // SEND MOBILE VERIFIED
      // =================================================

      socket.emit("mobile_verified", {
        success: true,

        existingUser: false,

        userId: user.userId,

        mobile: user.mobile,

        messages: [],
      });

      // =================================================
      // SEND EMPTY CHAT HISTORY
      // =================================================

      socket.emit("chat_history", {
        userId: user.userId,

        mobile: user.mobile,

        messages: [],
      });

      // =================================================
      // NOTIFY ADMIN
      // =================================================

      io.emit("new_user_connected", {
        userId: user.userId,

        mobile: user.mobile,

        existingUser: false,
      });

    } catch (error) {
      console.error(
        "User join error:",
        error
      );

      socket.emit(
        "mobile_verification_error",
        {
          success: false,

          message:
            "Unable to verify mobile number",
        }
      );
    }
  });

  // ===================================================
  // USER SEND MESSAGE
  // ===================================================

  socket.on(
    "send_user_message",
    async (data) => {
      try {
        // =============================================
        // CHECK USER SESSION
        // =============================================

        const onlineUser =
          onlineUsers[socket.id];

        if (!onlineUser) {
          socket.emit(
            "message_error",
            {
              success: false,

              message:
                "Please verify your mobile number first",
            }
          );

          return;
        }

        // =============================================
        // CHECK MESSAGE
        // =============================================

        if (
          !data ||
          !data.message ||
          !String(data.message).trim()
        ) {
          return;
        }

        // =============================================
        // CREATE MESSAGE
        // =============================================

        const newMessage = {
          sender: "user",

          message:
            String(data.message).trim(),

          time: new Date(),
        };

        // =============================================
        // SAVE MESSAGE TO MONGODB
        // =============================================

        const updatedUser =
          await ChatUser.findOneAndUpdate(
            {
              userId:
                onlineUser.userId,
            },

            {
              $push: {
                messages:
                  newMessage,
              },
            },

            {
              returnDocument: "after"
            }
          );

        if (!updatedUser) {
          socket.emit(
            "message_error",
            {
              success: false,

              message:
                "User account not found",
            }
          );

          return;
        }

        // =============================================
        // SEND MESSAGE TO ADMIN
        // =============================================

        io.emit(
          "admin_receive_message",
          {
            userId:
              onlineUser.userId,

            mobile:
              onlineUser.mobile,

            message:
              newMessage.message,

            time:
              new Date().toLocaleTimeString(
                [],
                {
                  hour: "2-digit",
                  minute: "2-digit",
                }
              ),
          }
        );

        // =============================================
        // MESSAGE SAVED
        // =============================================

        socket.emit(
          "message_saved",
          {
            success: true,

            message:
              newMessage,
          }
        );

      } catch (error) {
        console.error(
          "User message error:",
          error
        );

        socket.emit(
          "message_error",
          {
            success: false,

            message:
              "Unable to send message",
          }
        );
      }
    }
  );

  // ===================================================
  // ADMIN SEND REPLY
  // ===================================================

  socket.on(
    "admin_send_reply",
    async (data) => {
      try {
        if (!data) {
          return;
        }

        const userId = data.userId;

        const message =
          data.message
            ? String(data.message).trim()
            : "";

        if (!userId || !message) {
          return;
        }

        // =============================================
        // CHECK USER EXISTS
        // =============================================

        const user =
          await ChatUser.findOne({
            userId: userId,
          });

        if (!user) {
          console.log(
            "Admin reply failed. User not found:",
            userId
          );

          return;
        }

        // =============================================
        // CREATE MESSAGE
        // =============================================

        const newMessage = {
          sender: "admin",

          message: message,

          time: new Date(),
        };

        // =============================================
        // SAVE ADMIN MESSAGE
        // =============================================

        await ChatUser.findOneAndUpdate(
          {
            userId: userId,
          },

          {
            $push: {
              messages:
                newMessage,
            },
          }
        );

        // =============================================
        // SEND TO SELECTED USER ONLY
        // =============================================

        io.to(userId).emit(
          "user_receive_message",
          {
            message: message,

            time:
              new Date().toLocaleTimeString(
                [],
                {
                  hour: "2-digit",

                  minute: "2-digit",
                }
              ),
          }
        );

        // =============================================
        // UPDATE ADMIN
        // =============================================

        io.emit(
          "admin_reply_saved",
          {
            userId: userId,

            mobile: user.mobile,

            message: message,

            time:
              new Date().toLocaleTimeString(
                [],
                {
                  hour: "2-digit",

                  minute: "2-digit",
                }
              ),
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

  // ===================================================
  // DISCONNECT
  // ===================================================

  socket.on(
    "disconnect",
    (reason) => {
      if (onlineUsers[socket.id]) {
        console.log(
          "User disconnected:",

          onlineUsers[
            socket.id
          ].userId,

          reason
        );

        delete onlineUsers[
          socket.id
        ];
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
            updatedAt: -1,
          });

      res.json(users);

    } catch (error) {
      console.error(
        "Get users error:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load users",
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
            req.params.userId,
        });

      if (!user) {
        return res.status(404).json({
          error:
            "User not found",
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
          "Unable to load chat history",
      });
    }
  }
);

// =====================================================
// VERIFY MOBILE API
// =====================================================
//
// This API can also be used by your frontend before
// opening the chat.
//
// Existing mobile:
//    returns existing user + history
//
// New mobile:
//    creates a new user + empty history
//
// =====================================================

app.post(
  "/api/verify-mobile",
  async (req, res) => {
    try {
      const mobile =
        normalizeMobile(
          req.body.mobile
        );

      // =============================================
      // VALIDATE MOBILE
      // =============================================

      if (!mobile) {
        return res.status(400).json({
          success: false,

          message:
            "Please enter a valid 10-digit mobile number",
        });
      }

      // =============================================
      // FIND BY MOBILE
      // =============================================

      let user =
        await ChatUser.findOne({
          mobile: mobile,
        });

      // =============================================
      // EXISTING USER
      // =============================================

      if (user) {
        return res.json({
          success: true,

          existingUser: true,

          userId:
            user.userId,

          mobile:
            user.mobile,

          messages:
            user.messages || [],
        });
      }

      // =============================================
      // NEW USER
      // =============================================

      const newUserId =
        generateUserId();

      user =
        await ChatUser.create({
          userId:
            newUserId,

          mobile:
            mobile,

          messages: [],
        });

      return res.status(201).json({
        success: true,

        existingUser: false,

        userId:
          user.userId,

        mobile:
          user.mobile,

        messages: [],
      });

    } catch (error) {
      console.error(
        "Verify mobile error:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Unable to verify mobile number",
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
        req.originalUrl,
    });
  }
);

// =====================================================
// PORT
// =====================================================

const PORT =
  process.env.PORT || 3000;

// =====================================================
// START SERVER
// =====================================================

async function startServer() {
  try {
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

  } catch (error) {
    console.error(
      "Server startup failed:",
      error
    );

    process.exit(1);
  }
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