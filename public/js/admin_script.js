"use strict";

// =====================================================
// SOCKET.IO
// =====================================================

const socket = io({
  transports: ["websocket", "polling"],
});

// =====================================================
// ADMIN PRESENCE / ACTIVE STATUS
// =====================================================
//
// This page is the ADMIN page.
//
// The USER page determines whether the admin is active by
// receiving the "admin_presence" event from the server.
//
// ONLINE:
//   - admin page is visible
//   - socket is connected
//   - heartbeat is being sent every 5 seconds
//
// OFFLINE:
//   - admin changes browser tab
//   - admin minimizes/backgrounds the page
//   - admin closes/navigates away
//   - socket disconnects
//   - server stops receiving heartbeat
// =====================================================

let adminPresenceTimer = null;

function getAdminPresenceStatus() {
  return document.visibilityState === "visible" && socket.connected
    ? "online"
    : "offline";
}

function sendAdminPresence() {
  const status = getAdminPresenceStatus();

  socket.emit("admin_presence", {
    status: status,
  });

  console.log("Admin presence sent:", status);
}

// Send presence immediately after socket connects.
socket.on("connect", () => {
  sendAdminPresence();

  clearInterval(adminPresenceTimer);

  // Heartbeat every 5 seconds while this page is active.
  adminPresenceTimer = setInterval(() => {
    sendAdminPresence();
  }, 5000);
});

// If the socket disconnects, explicitly tell the server offline.
socket.on("disconnect", (reason) => {
  clearInterval(adminPresenceTimer);

  socket.emit("admin_presence", {
    status: "offline",
  });

  console.log("Admin presence: offline", reason);
});

// Detect admin switching tabs/minimizing browser.
document.addEventListener("visibilitychange", () => {
  sendAdminPresence();
});

// Also handle browser focus/blur.
window.addEventListener("focus", () => {
  sendAdminPresence();
});

window.addEventListener("blur", () => {
  sendAdminPresence();
});

// Tell the server that admin is offline before leaving.
window.addEventListener("pagehide", () => {
  socket.emit("admin_presence", {
    status: "offline",
  });
});

// Older browsers may fire beforeunload instead of pagehide.
window.addEventListener("beforeunload", () => {
  socket.emit("admin_presence", {
    status: "offline",
  });
});

// =====================================================
// CURRENT USER
// =====================================================

let currentUserId = null;

// =====================================================
// USER DATA
//
// online = user's browser tab is visible
// offline = user's browser tab is hidden/closed/disconnected
// =====================================================

const userChats = {};

// =====================================================
// ELEMENTS
// =====================================================

const userList = document.getElementById("userList");

const adminChatBox = document.getElementById("adminChatBox");

const activeUserHeader = document.getElementById("activeUserHeader");

const adminInput = document.getElementById("adminInput");

const userTitle = document.getElementById("userTitle");

const sidebar = document.getElementById("sidebar");

const sidebarOverlay = document.getElementById("sidebarOverlay");

// =====================================================
// VIEWPORT HEIGHT
// =====================================================

function updateViewportHeight() {
  const height = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;

  document.documentElement.style.setProperty("--app-height", `${height}px`);
}

updateViewportHeight();

window.addEventListener("resize", updateViewportHeight);

window.addEventListener("orientationchange", updateViewportHeight);

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateViewportHeight);
}

// =====================================================
// SIDEBAR
// =====================================================

function openSidebar() {
  sidebar.classList.add("mobile-open");
  sidebarOverlay.classList.add("mobile-open");
}

function closeSidebar() {
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("mobile-open");
}

function showUserList() {
  closeSidebar();

  if (window.innerWidth <= 700) {
    openSidebar();
  }
}

// =====================================================
// LOAD ALL USERS
// =====================================================

async function loadUsers(options = {}) {
  const preserveUnread = options.preserveUnread !== false;

  try {
    const response = await fetch(`/api/chat-users?_=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Unable to load users");
    }

    const users = await response.json();

    // -----------------------------------------------
    // PRESERVE CURRENT ONLINE STATUS
    // -----------------------------------------------

    const oldStatus = {};

    Object.keys(userChats).forEach((id) => {
      oldStatus[id] = userChats[id].online === true;
    });

    // -----------------------------------------------
    // PRESERVE UNREAD
    // -----------------------------------------------

    const oldUnread = {};

    Object.keys(userChats).forEach((id) => {
      oldUnread[id] = userChats[id].unread || 0;
    });

    // -----------------------------------------------
    // CLEAR USERS
    // -----------------------------------------------

    Object.keys(userChats).forEach((key) => {
      delete userChats[key];
    });

    // -----------------------------------------------
    // STORE USERS
    // -----------------------------------------------

    users.forEach((user) => {
      userChats[user.userId] = {
        userId: user.userId,

        mobile: user.mobile,

        messages: Array.isArray(user.messages) ? user.messages : [],

        unread: preserveUnread ? oldUnread[user.userId] || 0 : 0,

        // Preserve live socket presence.
        online: oldStatus[user.userId] === true,
      };
    });

    userTitle.innerText = `All Users (${users.length})`;

    renderUserList();

    // -----------------------------------------------
    // REFRESH SELECTED USER
    // -----------------------------------------------

    if (currentUserId && userChats[currentUserId]) {
      await loadUserHistory(currentUserId, {
        renderHeader: true,
        renderChat: true,
      });
    }
  } catch (error) {
    console.error("Load users error:", error);

    if (Object.keys(userChats).length === 0) {
      userList.innerHTML = `
        <div class="empty-users">
          Unable to load users.
          <br><br>
          Please check the server connection.
        </div>
      `;
    }
  }
}

// =====================================================
// AUTOMATIC DATABASE REFRESH
// =====================================================

let refreshTimer = null;

function autoRefreshFromServer() {
  clearTimeout(refreshTimer);

  refreshTimer = setTimeout(async () => {
    await loadUsers({
      preserveUnread: true,
    });
  }, 150);
}

// =====================================================
// LOAD SINGLE USER HISTORY
// =====================================================

async function loadUserHistory(userId, options = {}) {
  const { renderHeader = true, renderChat = true } = options;

  try {
    const response = await fetch(
      `/api/chat-users/${encodeURIComponent(userId)}?_=${Date.now()}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error("History not found");
    }

    const user = await response.json();

    // -----------------------------------------------
    // KEEP LIVE ONLINE STATUS
    // -----------------------------------------------

    const existingOnline = userChats[user.userId]?.online === true;

    const existingUnread = userChats[user.userId]?.unread || 0;

    userChats[user.userId] = {
      userId: user.userId,

      mobile: user.mobile,

      messages: Array.isArray(user.messages) ? user.messages : [],

      unread: existingUnread,

      online: existingOnline,
    };

    if (renderHeader) {
      renderActiveUserHeader(user);
    }

    if (renderChat) {
      renderMessages();
    }
  } catch (error) {
    console.error("History error:", error);

    if (renderChat) {
      adminChatBox.innerHTML = `
        <div class="empty-chat">
          Unable to load this user's chat history.
        </div>
      `;
    }
  }
}

// =====================================================
// RENDER ACTIVE USER HEADER
// =====================================================

function renderActiveUserHeader(user) {
  const isOnline = userChats[user.userId]?.online === true;

  const statusClass = isOnline ? "online" : "offline";

  const statusText = isOnline ? "online" : "offline";

  activeUserHeader.innerHTML = `

    <button
      type="button"
      class="back-button"
      onclick="showUserList()"
      aria-label="Back to users"
    >
      ‹
    </button>

    <div class="header-content">

      <div class="header-mobile">
        📱 ${escapeHtml(user.mobile)}
      </div>

      <div
        class="header-user-status ${statusClass}"
      >

        <span
          class="status-dot ${statusClass}"
        ></span>

        <span>
          ${statusText}
        </span>

      </div>

    </div>

    <div class="header-status">
      Admin
    </div>

  `;
}

// =====================================================
// UPDATE ONE USER PRESENCE
// =====================================================

function updateUserPresence(userId, status, mobile) {
  if (!userId) {
    return;
  }

  const online = status === "online";

  // -----------------------------------------------
  // CREATE USER IF NECESSARY
  // -----------------------------------------------

  if (!userChats[userId]) {
    userChats[userId] = {
      userId: userId,

      mobile: mobile || "",

      messages: [],

      unread: 0,

      online: online,
    };
  } else {
    userChats[userId].online = online;

    if (mobile && !userChats[userId].mobile) {
      userChats[userId].mobile = mobile;
    }
  }

  // -----------------------------------------------
  // UPDATE SIDEBAR
  // -----------------------------------------------

  renderUserList();

  // -----------------------------------------------
  // UPDATE ACTIVE USER HEADER
  // -----------------------------------------------

  if (currentUserId === userId) {
    renderActiveUserHeader(userChats[userId]);
  }

  console.log(`User ${userId} is ${status}`);
}

// =====================================================
// USER PRESENCE
//
// The user page sends:
//
// socket.emit("user_presence", {
//   userId,
//   mobile,
//   status: "online"
// });
//
// or:
//
// status: "offline"
// =====================================================

socket.on("user_presence", function (data) {
  if (!data || !data.userId) {
    return;
  }

  updateUserPresence(data.userId, data.status, data.mobile);
});

// =====================================================
// ALTERNATIVE PRESENCE EVENT
//
// Supports servers using:
// "user_presence_update"
// =====================================================

socket.on("user_presence_update", function (data) {
  if (!data || !data.userId) {
    return;
  }

  updateUserPresence(data.userId, data.status, data.mobile);
});

// =====================================================
// USER SELECT
// =====================================================

function selectUser(userId) {
  if (!userChats[userId]) {
    return;
  }

  currentUserId = userId;

  userChats[userId].unread = 0;

  renderUserList();

  loadUserHistory(userId);

  if (window.innerWidth <= 700) {
    closeSidebar();
  }

  setTimeout(() => {
    adminInput.focus();
  }, 100);
}

// =====================================================
// RENDER USER LIST
// =====================================================

function renderUserList() {
  userList.innerHTML = "";

  const ids = Object.keys(userChats);

  if (ids.length === 0) {
    userList.innerHTML = `
      <div class="empty-users">
        No users found
      </div>
    `;

    userTitle.innerText = "All Users (0)";

    return;
  }

  // -----------------------------------------------
  // SORT
  // -----------------------------------------------

  ids.sort((a, b) => {
    const aMessages = userChats[a].messages || [];

    const bMessages = userChats[b].messages || [];

    const aLast = aMessages.length
      ? new Date(aMessages[aMessages.length - 1].time).getTime()
      : 0;

    const bLast = bMessages.length
      ? new Date(bMessages[bMessages.length - 1].time).getTime()
      : 0;

    return bLast - aLast;
  });

  // -----------------------------------------------
  // USERS
  // -----------------------------------------------

  ids.forEach((id) => {
    const user = userChats[id];

    const div = document.createElement("div");

    let className = "user-tab";

    if (id === currentUserId) {
      className += " active";
    }

    if (user.unread > 0 && id !== currentUserId) {
      className += " new-message";
    }

    div.className = className;

    // ---------------------------------------------
    // ONLINE/OFFLINE
    // ---------------------------------------------

    const isOnline = user.online === true;

    const statusClass = isOnline ? "online" : "offline";

    const statusText = isOnline ? "online" : "offline";

    // ---------------------------------------------
    // LAST MESSAGE
    // ---------------------------------------------

    let lastMessage = "";

    if (Array.isArray(user.messages) && user.messages.length) {
      lastMessage = user.messages[user.messages.length - 1].message || "";
    }

    // ---------------------------------------------
    // USER HTML
    // ---------------------------------------------

    div.innerHTML = `

        <span class="user-mobile">

          <span
            class="status-dot ${statusClass}"
          ></span>

          <span>
            📱 ${escapeHtml(user.mobile)}
          </span>

        </span>

        <span
          class="user-status-text ${statusClass}"
        >
          ${statusText}
        </span>

        <span class="last-message">
          ${escapeHtml(lastMessage || "No messages")}
        </span>

        ${
          user.unread > 0
            ? `
              <span class="unread-badge">

                ${user.unread > 99 ? "99+" : user.unread}

              </span>
            `
            : ""
        }

      `;

    div.addEventListener("click", () => {
      selectUser(id);
    });

    userList.appendChild(div);
  });

  userTitle.innerText = `All Users (${ids.length})`;
}

// =====================================================
// RENDER CHAT
// =====================================================

function renderMessages() {
  adminChatBox.innerHTML = "";

  if (!currentUserId || !userChats[currentUserId]) {
    adminChatBox.innerHTML = `
      <div class="empty-chat">
        Select a user from the user list
        to view their conversation.
      </div>
    `;

    return;
  }

  const messages = userChats[currentUserId].messages || [];

  if (messages.length === 0) {
    adminChatBox.innerHTML = `
      <div class="empty-chat">
        No chat history for this user.
      </div>
    `;

    return;
  }

  messages.forEach((message) => {
    if (!message) {
      return;
    }

    const div = document.createElement("div");

    div.className = `msg ${message.sender === "admin" ? "admin" : "user"}`;

    let time = "Just now";

    if (message.time) {
      const date = new Date(message.time);

      if (!isNaN(date.getTime())) {
        time = date.toLocaleTimeString([], {
          hour: "2-digit",

          minute: "2-digit",
        });
      }
    }

    const messageDiv = document.createElement("div");

    messageDiv.textContent = message.message || "";

    const timeDiv = document.createElement("div");

    timeDiv.className = "msg-time";

    timeDiv.textContent = time;

    div.appendChild(messageDiv);

    div.appendChild(timeDiv);

    adminChatBox.appendChild(div);
  });

  requestAnimationFrame(() => {
    adminChatBox.scrollTop = adminChatBox.scrollHeight;
  });
}

// =====================================================
// NEW USER CONNECTED
// =====================================================

socket.on("new_user_connected", (data) => {
  if (!data || !data.userId) {
    return;
  }

  if (!userChats[data.userId]) {
    userChats[data.userId] = {
      userId: data.userId,

      mobile: data.mobile || "",

      messages: [],

      unread: 0,

      online: true,
    };
  } else {
    if (data.mobile) {
      userChats[data.userId].mobile = data.mobile;
    }

    // New connection means the user is online.
    userChats[data.userId].online = true;
  }

  renderUserList();

  autoRefreshFromServer();
});

// =====================================================
// NEW USER MESSAGE
// =====================================================

socket.on("admin_receive_message", async (data) => {
  if (!data || !data.userId || !data.message) {
    return;
  }

  // -----------------------------------------------
  // CREATE USER
  // -----------------------------------------------

  if (!userChats[data.userId]) {
    userChats[data.userId] = {
      userId: data.userId,

      mobile: data.mobile || "",

      messages: [],

      unread: 0,

      online: true,
    };
  }

  // -----------------------------------------------
  // MESSAGE
  // -----------------------------------------------

  const messageTime = data.time ? new Date(data.time) : new Date();

  const alreadyAdded = userChats[data.userId].messages.some((message) => {
    if (!data.time) {
      return false;
    }

    return (
      message.sender === "user" &&
      message.message === data.message &&
      new Date(message.time).getTime() === messageTime.getTime()
    );
  });

  if (!alreadyAdded) {
    userChats[data.userId].messages.push({
      sender: "user",

      message: data.message,

      time: messageTime,
    });
  }

  // -----------------------------------------------
  // A MESSAGE FROM THE USER ALSO MEANS THE SOCKET
  // IS CURRENTLY ACTIVE.
  // -----------------------------------------------

  userChats[data.userId].online = true;

  // -----------------------------------------------
  // UNREAD
  // -----------------------------------------------

  if (currentUserId !== data.userId) {
    userChats[data.userId].unread++;
  }

  renderUserList();

  if (currentUserId === data.userId) {
    renderMessages();

    renderActiveUserHeader(userChats[data.userId]);
  }

  // -----------------------------------------------
  // SYNC DATABASE
  // -----------------------------------------------

  autoRefreshFromServer();
});

// =====================================================
// ADMIN REPLY
// =====================================================

function sendReply() {
  const text = adminInput.value.trim();

  if (!text) {
    return;
  }

  if (!currentUserId) {
    alert("Please select a user first.");

    return;
  }

  if (!userChats[currentUserId]) {
    alert("Selected user was not found.");

    return;
  }

  const messageTime = new Date();

  userChats[currentUserId].messages.push({
    sender: "admin",

    message: text,

    time: messageTime,
  });

  socket.emit("admin_send_reply", {
    userId: currentUserId,

    message: text,
  });

  renderMessages();

  autoRefreshFromServer();

  adminInput.value = "";

  adminInput.focus();
}

// =====================================================
// ENTER KEY
// =====================================================

function handleKey(event) {
  if (event.key === "Enter") {
    event.preventDefault();

    sendReply();
  }
}

// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHtml(value) {
  const div = document.createElement("div");

  div.textContent = value ?? "";

  return div.innerHTML;
}

// =====================================================
// SOCKET CONNECT
// =====================================================

socket.on("connect", () => {
  console.log("Admin socket connected:", socket.id);

  loadUsers({
    preserveUnread: true,
  });
});

// =====================================================
// SOCKET ERROR
// =====================================================

socket.on("connect_error", (error) => {
  console.error("Socket connection error:", error);
});

// =====================================================
// SOCKET DISCONNECT
// =====================================================

socket.on("disconnect", (reason) => {
  console.log("Admin socket disconnected:", reason);

  /*
          Do not mark every user offline here.
          The user presence state belongs to each
          individual user's socket.
        */
});

// =====================================================
// WINDOW RESIZE
// =====================================================

window.addEventListener("resize", () => {
  if (window.innerWidth > 700) {
    closeSidebar();
  }
});

// =====================================================
// INITIAL LOAD
// =====================================================

loadUsers({
  preserveUnread: false,
});

// =====================================================
// MOBILE SIDEBAR
// =====================================================

if (window.innerWidth <= 700) {
  setTimeout(() => {
    openSidebar();
  }, 100);
}
