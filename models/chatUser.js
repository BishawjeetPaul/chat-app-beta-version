'use strict';

const mongoose = require('mongoose');

/////////////////////////////////////////////////
// MESSAGE SCHEMA
/////////////////////////////////////////////////

const messageSchema = new mongoose.Schema(
  {
    // ==========================================
    // MESSAGE SENDER
    // ==========================================

    sender: {
      type: String,
      required: true,
      enum: ['user', 'admin']
    },

    // ==========================================
    // MESSAGE TEXT
    // ==========================================

    message: {
      type: String,
      required: true,
      trim: true
    },

    // ==========================================
    // MESSAGE TIME
    // ==========================================

    time: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: true
  }
);

/////////////////////////////////////////////////
// CHAT USER SCHEMA
/////////////////////////////////////////////////

const chatUserSchema = new mongoose.Schema(
  {
    // ==========================================
    // USER ID
    // ==========================================

    userId: {
      type: String,
      required: true,
      index: true
    },

    // ==========================================
    // MOBILE NUMBER
    // ==========================================

    mobile: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    // ==========================================
    // USER NAME
    // ==========================================

    name: {
      type: String,
      default: 'User',
      trim: true
    },

    // ==========================================
    // IPv4 ADDRESS
    // ==========================================

    ipv4: {
      type: String,
      default: null,
      trim: true
    },

    // ==========================================
    // IPv6 ADDRESS
    // ==========================================

    ipv6: {
      type: String,
      default: null,
      trim: true
    },

    // ==========================================
    // CURRENT IP ADDRESS
    //
    // This contains whichever IP was detected.
    // ==========================================

    ipAddress: {
      type: String,
      default: null,
      trim: true
    },

    // ==========================================
    // LAST VISIT
    // ==========================================

    lastVisit: {
      type: Date,
      default: Date.now
    },

    // ==========================================
    // USER AGENT
    // ==========================================

    userAgent: {
      type: String,
      default: null
    },

    // ==========================================
    // CHAT MESSAGES
    // ==========================================

    messages: {
      type: [messageSchema],
      default: []
    }
  },

  {
    timestamps: true
  }
);

/////////////////////////////////////////////////
// EXPORT MODEL
/////////////////////////////////////////////////

module.exports =
  mongoose.models.ChatUser ||
  mongoose.model('ChatUser', chatUserSchema);