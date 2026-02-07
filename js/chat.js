document.addEventListener("DOMContentLoaded", () => {
  let currentUser = null;
  let currentRole = null;
  let currentConversationId = null;
  let pollInterval = null;

  const identitySection = document.getElementById("chat-identity");
  const chatApp = document.getElementById("chat-app");
  const loadChatsBtn = document.getElementById("load-chats-btn");
  const conversationList = document.getElementById("conversation-list");
  const noConversations = document.getElementById("no-conversations");
  const chatPlaceholder = document.getElementById("chat-placeholder");
  const chatThread = document.getElementById("chat-thread");
  const messagesContainer = document.getElementById("messages-container");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  const moderationWarning = document.getElementById("moderation-warning");
  const threadName = document.getElementById("thread-name");
  const threadRole = document.getElementById("thread-role");
  const backBtn = document.getElementById("back-to-list");
  const newChatBtn = document.getElementById("new-chat-btn");
  const newChatModal = document.getElementById("new-chat-modal");
  const startChatBtn = document.getElementById("start-chat-btn");
  const cancelChatBtn = document.getElementById("cancel-chat-btn");
  const chatSidebar = document.querySelector(".chat-sidebar");
  const chatMain = document.querySelector(".chat-main");

  const params = new URLSearchParams(window.location.search);
  const presetCreator = params.get("creator");
  const presetBuyer = params.get("buyer");

  if (presetBuyer && presetCreator) {
    currentUser = presetBuyer;
    currentRole = "buyer";
    identitySection.classList.add("hidden");
    chatApp.classList.remove("hidden");
    loadConversations().then(() => {
      startConversation(presetCreator, presetBuyer);
    });
  } else {
    setTimeout(() => {
      try {
        const authData = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (authData && authData.user) {
          const user = authData.user;
          const profile = authData.profile;
          const displayName = profile && profile.stage_name ? profile.stage_name : (user.first_name || user.email || 'User');
          const role = profile && profile.account_type === 'creator' ? 'creator' : 'buyer';

          document.getElementById("identity-name").value = displayName;
          document.getElementById("identity-role").value = role;
        }
      } catch (e) {}
    }, 600);
  }

  loadChatsBtn.addEventListener("click", () => {
    const name = document.getElementById("identity-name").value.trim();
    const role = document.getElementById("identity-role").value;

    if (!name) return;

    currentUser = name;
    currentRole = role;
    identitySection.classList.add("hidden");
    chatApp.classList.remove("hidden");
    loadConversations();
  });

  async function loadConversations() {
    try {
      const res = await fetch(`/api/conversations?user=${encodeURIComponent(currentUser)}&role=${currentRole}`);
      const conversations = await res.json();

      conversationList.innerHTML = "";

      if (conversations.length === 0) {
        noConversations.classList.remove("hidden");
        return;
      }

      noConversations.classList.add("hidden");

      conversations.forEach(conv => {
        const otherName = currentRole === "creator" ? conv.buyer_name : conv.creator_name;
        const preview = conv.last_message || "No messages yet";
        const previewText = preview.length > 40 ? preview.substring(0, 40) + "..." : preview;
        const time = conv.last_message_at ? formatTime(conv.last_message_at) : "";

        const el = document.createElement("div");
        el.className = "conversation-item" + (conv.id === currentConversationId ? " active" : "");
        el.setAttribute("data-id", conv.id);
        el.innerHTML = `
          <div class="conv-name">${escapeHtml(otherName)}</div>
          <div class="conv-preview">${escapeHtml(previewText)}</div>
          ${time ? `<div class="conv-time">${time}</div>` : ""}
        `;
        el.addEventListener("click", () => openThread(conv.id, otherName));
        conversationList.appendChild(el);
      });
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  }

  function openThread(conversationId, otherName) {
    currentConversationId = conversationId;
    chatPlaceholder.classList.add("hidden");
    chatThread.classList.remove("hidden");
    threadName.textContent = otherName;
    threadRole.textContent = currentRole === "creator" ? "Buyer" : "Creator";
    moderationWarning.classList.add("hidden");

    chatSidebar.classList.add("thread-open");
    chatMain.classList.remove("thread-closed");

    document.querySelectorAll(".conversation-item").forEach(el => {
      el.classList.toggle("active", parseInt(el.getAttribute("data-id")) === conversationId);
    });

    loadMessages(conversationId);

    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(() => {
      loadMessages(conversationId);
      loadConversations();
    }, 5000);
  }

  async function loadMessages(conversationId) {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      const messages = await res.json();

      const wasAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 50;
      const prevCount = messagesContainer.children.length;

      messagesContainer.innerHTML = "";

      messages.forEach(msg => {
        const isSent = msg.sender_name === currentUser;
        const bubble = document.createElement("div");
        bubble.className = "message-bubble " + (isSent ? "sent" : "received");
        bubble.innerHTML = `
          <div>${escapeHtml(msg.content)}</div>
          <div class="message-meta">${escapeHtml(msg.sender_name)} · ${formatTime(msg.created_at)}</div>
        `;
        messagesContainer.appendChild(bubble);
      });

      if (wasAtBottom || messages.length !== prevCount) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    }
  }

  messageInput.addEventListener("input", () => {
    sendBtn.disabled = !messageInput.value.trim();
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + "px";
  });

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (messageInput.value.trim()) sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);

  async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !currentConversationId) return;

    sendBtn.disabled = true;
    messageInput.value = "";
    messageInput.style.height = "auto";
    moderationWarning.classList.add("hidden");

    try {
      const res = await fetch(`/api/conversations/${currentConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          senderType: currentRole,
          senderName: currentUser
        })
      });

      if (res.status === 403) {
        const data = await res.json();
        moderationWarning.textContent = data.warning || "Message blocked: " + data.reason;
        moderationWarning.classList.remove("hidden");
        messageInput.value = content;
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to send");
      }

      await loadMessages(currentConversationId);
      await loadConversations();
    } catch (error) {
      console.error("Failed to send message:", error);
      messageInput.value = content;
    }

    sendBtn.disabled = !messageInput.value.trim();
  }

  backBtn.addEventListener("click", () => {
    chatThread.classList.add("hidden");
    chatPlaceholder.classList.remove("hidden");
    chatSidebar.classList.remove("thread-open");
    chatMain.classList.add("thread-closed");
    currentConversationId = null;
    if (pollInterval) clearInterval(pollInterval);
  });

  newChatBtn.addEventListener("click", () => {
    newChatModal.classList.remove("hidden");
    const targetInput = document.getElementById("new-chat-target");
    targetInput.value = "";
    if (currentRole === "creator") {
      document.querySelector(".modal-content label").textContent = "Buyer Name";
      targetInput.placeholder = "Enter buyer name";
    } else {
      document.querySelector(".modal-content label").textContent = "Creator Name";
      targetInput.placeholder = "Enter creator name";
    }
  });

  cancelChatBtn.addEventListener("click", () => {
    newChatModal.classList.add("hidden");
  });

  startChatBtn.addEventListener("click", async () => {
    const target = document.getElementById("new-chat-target").value.trim();
    if (!target) return;

    const creatorName = currentRole === "creator" ? currentUser : target;
    const buyerName = currentRole === "buyer" ? currentUser : target;

    await startConversation(creatorName, buyerName);
    newChatModal.classList.add("hidden");
  });

  async function startConversation(creatorName, buyerName) {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorName, buyerName })
      });

      const conversation = await res.json();
      await loadConversations();

      const otherName = currentRole === "creator" ? buyerName : creatorName;
      openThread(conversation.id, otherName);
    } catch (error) {
      console.error("Failed to start conversation:", error);
    }
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";

    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
});
