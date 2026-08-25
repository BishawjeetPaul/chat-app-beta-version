const mongoose = require("mongoose");

// ==========================================
// MESSAGE SCHEMA
// ==========================================

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ["user", "admin"],
    required: true,
  },

  message: {
    type: String,
    required: true,
  },

  time: {
    type: Date,
    default: Date.now,
  },
});

// ==========================================
// CHAT USER SCHEMA
// ==========================================

const chatUserSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    mobile: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("ChatUser", chatUserSchema);
