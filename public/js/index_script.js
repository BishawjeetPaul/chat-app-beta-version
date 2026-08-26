// =====================================================
// SOCKET.IO
// =====================================================

const socket = io({
  transports: ["websocket", "polling"],
});

// =====================================================
// ELEMENTS
// =====================================================

const chatBox = document.getElementById("chatBox");

const msgInput = document.getElementById("msgInput");

const nameOverlay = document.getElementById("nameOverlay");

const userMobileInput = document.getElementById("userMobileInput");

const startButton = document.getElementById("startButton");

const statusDot = document.getElementById("statusDot");

const statusText = document.getElementById("statusText");

// =====================================================
// USER DATA
// =====================================================

let userId = "";
let userMobile = "";
let mobileVerified = false;
let verifyingMobile = false;

// =====================================================
// STATIC ADMIN STATUS
// =====================================================
// This is intentionally static.
// The user page always displays the admin as ONLINE.
// There is no online/offline detection or Socket.IO
// presence functionality.
// =====================================================

function showStaticAdminOnline() {
  statusDot.classList.remove("offline");
  statusDot.classList.add("online");

  statusText.textContent = "online";
  statusText.style.display = "inline";
}

showStaticAdminOnline();

// =====================================================
// FULL SCREEN VIEWPORT
// =====================================================

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
// PAGE LOAD
// =====================================================

nameOverlay.style.display = "flex";
msgInput.disabled = true;

setTimeout(() => {
  userMobileInput.focus();
}, 100);

// =====================================================
// NORMALIZE MOBILE
// =====================================================

function normalizeMobile(mobile) {
  if (!mobile) {
    return "";
  }

  return String(mobile).replace(/\D/g, "").slice(0, 10);
}

// =====================================================
// START CHAT
// =====================================================

function startChat() {
  if (verifyingMobile) {
    return;
  }

  let mobile = normalizeMobile(userMobileInput.value.trim());

  userMobileInput.value = mobile;

  if (!mobile) {
    alert("Please enter your mobile number.");

    userMobileInput.focus();
    return;
  }

  if (!/^[6-9][0-9]{9}$/.test(mobile)) {
    alert("Please enter a valid 10-digit mobile number.");

    userMobileInput.focus();
    return;
  }

  verifyingMobile = true;
  mobileVerified = false;

  startButton.disabled = true;
  startButton.textContent = "Checking...";

  socket.emit("user_join", {
    mobile: mobile,
  });
}

// =====================================================
// MOBILE VERIFIED
// =====================================================

socket.on("mobile_verified", function (data) {
  console.log("Mobile verification result:", data);

  verifyingMobile = false;

  if (!data || data.success !== true || !data.userId || !data.mobile) {
    mobileVerified = false;

    alert(data?.message || "Unable to verify mobile number.");

    resetVerifyButton();

    return;
  }

  userId = data.userId;

  userMobile = data.mobile;

  mobileVerified = true;

  nameOverlay.style.display = "none";

  msgInput.disabled = false;

  resetVerifyButton();

  msgInput.focus();
});

// =====================================================
// CHAT HISTORY
// =====================================================

socket.on("chat_history", function (data) {
  console.log("Chat history received:", data);

  if (!mobileVerified) {
    console.warn("Ignoring chat history before mobile verification.");

    return;
  }

  if (!data) {
    return;
  }

  if (data.userId) {
    userId = data.userId;
  }

  if (data.mobile) {
    userMobile = data.mobile;
  }

  chatBox.innerHTML = "";

  if (Array.isArray(data.messages) && data.messages.length > 0) {
    data.messages.forEach(function (message) {
      if (!message || !message.message) {
        return;
      }

      appendMessage(
        message.message,
        message.sender === "user" ? "sent" : "received",
        formatMessageTime(message.time),
      );
    });
  } else {
    appendMessage("Hello! How can we help you?", "received", "Just now");
  }

  setTimeout(function () {
    chatBox.scrollTop = chatBox.scrollHeight;
  }, 50);
});

// =====================================================
// RECEIVE ADMIN MESSAGE
// =====================================================

socket.on("user_receive_message", function (data) {
  if (!mobileVerified) {
    return;
  }

  if (!data || !data.message) {
    return;
  }

  appendMessage(data.message, "received", formatMessageTime(data.time));
});

// =====================================================
// SEND MESSAGE
// =====================================================

function sendMessage() {
  const text = msgInput.value.trim();

  if (!text) {
    return;
  }

  if (!mobileVerified || !userId || !userMobile) {
    alert("Please verify your mobile number first.");

    nameOverlay.style.display = "flex";

    userMobileInput.focus();

    return;
  }

  const now = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  appendMessage(text, "sent", now);

  socket.emit("send_user_message", {
    message: text,
  });

  msgInput.value = "";
  msgInput.focus();
}

// =====================================================
// ENTER KEY
// =====================================================

function handleKey(event) {
  if (event.key === "Enter") {
    event.preventDefault();

    sendMessage();
  }
}

// =====================================================
// DISPLAY MESSAGE
// =====================================================

function appendMessage(text, type, time) {
  const msgDiv = document.createElement("div");

  msgDiv.className = `msg ${type}`;

  const messageText = document.createTextNode(text || "");

  const timeSpan = document.createElement("span");

  timeSpan.className = "time";

  timeSpan.textContent = time || "Just now";

  msgDiv.appendChild(messageText);

  msgDiv.appendChild(timeSpan);

  chatBox.appendChild(msgDiv);

  chatBox.scrollTop = chatBox.scrollHeight;
}

// =====================================================
// MESSAGE TIME
// =====================================================

function formatMessageTime(time) {
  if (!time) {
    return "Just now";
  }

  const date = new Date(time);

  if (isNaN(date.getTime())) {
    return "Just now";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// =====================================================
// MOBILE INPUT
// =====================================================

userMobileInput.addEventListener("input", function () {
  this.value = this.value.replace(/[^0-9]/g, "").slice(0, 10);
});

// =====================================================
// MOBILE ENTER
// =====================================================

userMobileInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();

    startChat();
  }
});

// =====================================================
// RESET VERIFY BUTTON
// =====================================================

function resetVerifyButton() {
  verifyingMobile = false;

  startButton.disabled = false;

  startButton.textContent = "Start Chat";
}

// =====================================================
// SOCKET CONNECTION
// =====================================================

socket.on("connect", function () {
  console.log("User socket connected:", socket.id);
});

socket.on("connect_error", function (error) {
  console.error("Socket connection error:", error);

  resetVerifyButton();
});

socket.on("disconnect", function (reason) {
  console.log("User socket disconnected:", reason);
});

// =====================================================
// SERVER VERIFICATION ERROR
// =====================================================

socket.on("mobile_verification_error", function (data) {
  console.error("Mobile verification error:", data);

  mobileVerified = false;
  userId = "";
  userMobile = "";

  alert(data?.message || "Unable to verify mobile number.");

  resetVerifyButton();

  nameOverlay.style.display = "flex";

  userMobileInput.focus();
});

// =====================================================
// MESSAGE ERROR
// =====================================================

socket.on("message_error", function (data) {
  console.error("Message error:", data);

  alert(data?.message || "Unable to send message.");
});

// =====================================================
// MESSAGE SAVED
// =====================================================

socket.on("message_saved", function (data) {
  if (data && data.success === false) {
    console.error("Message was not saved:", data);
  }
});
