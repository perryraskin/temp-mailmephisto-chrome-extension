// Popup Script for Mephisto TempMail Extension

import { generateMailbox, getSession, getMessages, getMessageDetail } from '../scripts/mailService.js';

// DOM Elements
const emailAddress = document.getElementById('emailAddress');
const copyBtn = document.getElementById('copyBtn');
const newEmailBtn = document.getElementById('newEmailBtn');
const refreshBtn = document.getElementById('refreshBtn');
const emailList = document.getElementById('emailList');
const emailCount = document.getElementById('emailCount');
const statusMessage = document.getElementById('statusMessage');
const listView = document.getElementById('listView');
const detailView = document.getElementById('detailView');
const backBtn = document.getElementById('backBtn');
const emailDetail = document.getElementById('emailDetail');

// State
let currentSession = null;
let currentEmails = [];

// Initialize
async function init() {
  await loadCurrentEmail();
  await refreshEmails();

  // Set up event listeners
  copyBtn.addEventListener('click', copyEmail);
  newEmailBtn.addEventListener('click', generateNewEmail);
  refreshBtn.addEventListener('click', refreshEmails);
  backBtn.addEventListener('click', showListView);
}

// Load current email address
async function loadCurrentEmail() {
  try {
    currentSession = await getSession();

    if (currentSession && currentSession.email_addr) {
      emailAddress.textContent = currentSession.email_addr;
    } else {
      // Generate new email if none exists
      const mailbox = await generateMailbox();
      if (mailbox) {
        currentSession = mailbox.session;
        emailAddress.textContent = mailbox.address;
        showStatus('New email generated!');
      } else {
        emailAddress.textContent = 'Error loading email';
        showStatus('Failed to generate email', true);
      }
    }
  } catch (error) {
    emailAddress.textContent = 'Error loading email';
    showStatus('Failed to load email', true);
  }
}

// Copy email to clipboard
async function copyEmail() {
  try {
    const email = emailAddress.textContent;

    if (email && email !== 'Loading...' && email !== 'Error loading email') {
      await navigator.clipboard.writeText(email);

      // Visual feedback
      const originalText = copyBtn.innerHTML;
      copyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      `;

      showStatus('Email copied to clipboard!');

      setTimeout(() => {
        copyBtn.innerHTML = originalText;
      }, 2000);
    }
  } catch (error) {
    showStatus('Failed to copy email', true);
  }
}

// Generate new email
async function generateNewEmail() {
  try {
    newEmailBtn.disabled = true;
    emailAddress.textContent = 'Generating...';

    const mailbox = await generateMailbox();

    if (mailbox) {
      currentSession = mailbox.session;
      emailAddress.textContent = mailbox.address;
      currentEmails = [];
      renderEmailList();
      showStatus('New email generated!');

      // Trigger background check
      chrome.runtime.sendMessage({ action: 'checkEmails' });
    } else {
      showStatus('Failed to generate new email', true);
      await loadCurrentEmail();
    }
  } catch (error) {
    showStatus('Failed to generate new email', true);
    await loadCurrentEmail();
  } finally {
    newEmailBtn.disabled = false;
  }
}

// Refresh emails
async function refreshEmails() {
  try {
    refreshBtn.disabled = true;
    refreshBtn.style.opacity = '0.5';

    const emails = await getMessages();
    // Filter out Guerrilla Mail welcome emails
    currentEmails = (emails || []).filter(email => {
      const isWelcomeEmail =
        email.from.address === 'no-reply@guerrillamail.com' &&
        email.subject.toLowerCase().includes('welcome to guerrilla mail');
      return !isWelcomeEmail;
    });

    renderEmailList();

    // Update badge
    const unreadCount = currentEmails.filter(e => !e.seen).length;
    chrome.runtime.sendMessage({ action: 'checkEmails' });

  } catch (error) {
    showStatus('Failed to refresh emails', true);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.style.opacity = '1';
  }
}

// Render email list
function renderEmailList() {
  emailCount.textContent = `${currentEmails.length} email${currentEmails.length !== 1 ? 's' : ''}`;

  if (currentEmails.length === 0) {
    emailList.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="20" height="16" x="2" y="4" rx="2"/>
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
        </svg>
        <p>No emails yet</p>
        <small>Emails will appear here when received</small>
      </div>
    `;
    return;
  }

  emailList.innerHTML = currentEmails.map(email => {
    const date = new Date(email.createdAt);
    const timeAgo = formatTimeAgo(date);

    return `
      <div class="email-item ${email.seen ? '' : 'unread'}" data-email-id="${email.id}">
        <div class="email-header">
          <div class="email-from">${escapeHtml(email.from.name || email.from.address)}</div>
          <div class="email-time">${timeAgo}</div>
        </div>
        <div class="email-subject">${escapeHtml(email.subject || '(No subject)')}</div>
        <div class="email-intro">${escapeHtml(email.intro || '')}</div>
        <span class="email-category category-${email.category.toLowerCase()}">${email.category}</span>
      </div>
    `;
  }).join('');

  // Add click listeners to email items
  document.querySelectorAll('.email-item').forEach(item => {
    item.addEventListener('click', () => {
      const emailId = item.dataset.emailId;
      openEmailDetail(emailId);
    });
  });
}

// Open email detail within popup
async function openEmailDetail(emailId) {
  try {
    // Show loading state
    detailView.classList.remove('hidden');
    listView.classList.add('hidden');
    emailDetail.innerHTML = '<div class="empty-state"><p>Loading email...</p></div>';

    // Fetch email detail
    const email = await getMessageDetail(emailId);

    if (!email) {
      emailDetail.innerHTML = '<div class="empty-state"><p>Failed to load email</p></div>';
      return;
    }

    // Format date
    const date = new Date(email.createdAt);
    const formattedDate = date.toLocaleString();

    // Render email detail
    emailDetail.innerHTML = `
      <div class="detail-subject">${escapeHtml(email.subject || '(No subject)')}</div>

      <div class="detail-section">
        <div class="detail-label">From</div>
        <div class="detail-value monospace">${escapeHtml(email.from.address)}</div>
      </div>

      <div class="detail-section">
        <div class="detail-label">Date</div>
        <div class="detail-value">${formattedDate}</div>
      </div>

      <div class="detail-section">
        <div class="detail-label">Category</div>
        <span class="email-category category-${email.category.toLowerCase()}">${email.category}</span>
      </div>

      <div class="detail-section">
        <div class="detail-label">Message</div>
        <div class="detail-body">${escapeHtml(email.text || email.html || '(Empty message)')}</div>
      </div>
    `;
  } catch (error) {
    emailDetail.innerHTML = '<div class="empty-state"><p>Error loading email</p></div>';
  }
}

// Show list view
function showListView() {
  detailView.classList.add('hidden');
  listView.classList.remove('hidden');
}

// Show status message
function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.remove('hidden', 'error');

  if (isError) {
    statusMessage.classList.add('error');
  }

  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 3000);
}

// Format time ago
function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-refresh emails every 30 seconds
setInterval(refreshEmails, 30000);

// Initialize on load
init();
