// modal.js - Professional Modal System

// ============================================
// MODAL CLASS
// ============================================

class Modal {
    constructor() {
        this.overlay = null;
        this.container = null;
        this.isOpen = false;
        this.createContainer();
    }

    createContainer() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'modal-container';
        
        this.overlay.appendChild(this.container);
        document.body.appendChild(this.overlay);
        
        // Close on overlay click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });
        
        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    show(options) {
        const {
            type = 'info',
            title = 'Information',
            subtitle = '',
            message = '',
            icon = null,
            buttons = [],
            closeButton = true
        } = options;

        // Get icon emoji based on type
        const defaultIcons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        const iconEmoji = icon || defaultIcons[type] || defaultIcons.info;

        // Build HTML
        let html = `
            <div class="modal-header">
                <div class="modal-icon ${type}">
                    ${iconEmoji}
                </div>
                <div class="modal-title">
                    <h3>${title}</h3>
                    ${subtitle ? `<p>${subtitle}</p>` : ''}
                </div>
                ${closeButton ? '<button class="modal-close">✕</button>' : ''}
            </div>
            <div class="modal-body">
                ${message}
            </div>
        `;

        // Add footer if buttons provided
        if (buttons.length > 0) {
            html += '<div class="modal-footer">';
            buttons.forEach((btn, index) => {
                const btnClass = btn.type || 'secondary';
                html += `
                    <button class="modal-btn modal-btn-${btnClass}" data-index="${index}">
                        ${btn.text}
                    </button>
                `;
            });
            html += '</div>';
        }

        this.container.innerHTML = html;

        // Attach button handlers
        buttons.forEach((btn, index) => {
            const btnElement = this.container.querySelector(`[data-index="${index}"]`);
            if (btnElement) {
                btnElement.addEventListener('click', () => {
                    if (btn.onClick) {
                        btn.onClick();
                    }
                    if (btn.close !== false) {
                        this.close();
                    }
                });
            }
        });

        // Attach close button handler
        if (closeButton) {
            const closeBtn = this.container.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.close());
            }
        }

        // Show modal
        this.open();
    }

    open() {
        this.isOpen = true;
        this.overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.isOpen = false;
        this.overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    showLoading(message = 'Loading...') {
        this.container.innerHTML = `
            <div class="modal-loading">
                <div class="modal-spinner"></div>
                <div class="modal-loading-text">${message}</div>
            </div>
        `;
        this.open();
    }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

class Toast {
    constructor() {
        this.container = null;
        this.createContainer();
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    show(options) {
        const {
            type = 'info',
            title = '',
            message = '',
            duration = 4000,
            icon = null
        } = options;

        // Get icon emoji based on type
        const defaultIcons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        const iconEmoji = icon || defaultIcons[type] || defaultIcons.info;

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">${iconEmoji}</div>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${title}</div>` : ''}
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">✕</button>
        `;

        // Add to container
        this.container.appendChild(toast);

        // Show animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Close button
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.remove(toast));

        // Auto remove
        if (duration > 0) {
            setTimeout(() => this.remove(toast), duration);
        }

        return toast;
    }

    remove(toast) {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    success(message, title = 'Success') {
        return this.show({ type: 'success', title, message });
    }

    error(message, title = 'Error') {
        return this.show({ type: 'error', title, message });
    }

    warning(message, title = 'Warning') {
        return this.show({ type: 'warning', title, message });
    }

    info(message, title = 'Info') {
        return this.show({ type: 'info', title, message });
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Create global instances
const modal = new Modal();
const toast = new Toast();

// Alert replacement
function showAlert(message, type = 'info', title = null) {
    const titles = {
        info: 'Information',
        success: 'Success',
        warning: 'Warning',
        error: 'Error'
    };

    modal.show({
        type: type,
        title: title || titles[type],
        message: message,
        buttons: [
            {
                text: 'OK',
                type: 'primary',
                onClick: () => {}
            }
        ]
    });
}

// Confirm replacement
function showConfirm(options) {
    const {
        title = 'Confirm',
        message = 'Are you sure?',
        type = 'warning',
        confirmText = 'Confirm',
        confirmType = 'danger',
        cancelText = 'Cancel',
        onConfirm = () => {},
        onCancel = () => {}
    } = options;

    modal.show({
        type: type,
        title: title,
        message: message,
        buttons: [
            {
                text: cancelText,
                type: 'secondary',
                onClick: onCancel
            },
            {
                text: confirmText,
                type: confirmType,
                onClick: onConfirm
            }
        ]
    });
}

// Loading modal
function showLoading(message = 'Loading...') {
    modal.showLoading(message);
}

function hideLoading() {
    modal.close();
}

// Success message
function showSuccess(message, title = 'Success') {
    toast.success(message, title);
}

// Error message
function showError(message, title = 'Error') {
    toast.error(message, title);
}

// Warning message
function showWarning(message, title = 'Warning') {
    toast.warning(message, title);
}

// Info message
function showInfo(message, title = 'Info') {
    toast.info(message, title);
}

// ============================================
// EXPORT FOR USE
// ============================================

// Make available globally
window.modal = modal;
window.toast = toast;
window.showAlert = showAlert;
window.showConfirm = showConfirm;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showSuccess = showSuccess;
window.showError = showError;
window.showWarning = showWarning;
window.showInfo = showInfo;