// auth.js - SECURED VERSION
// Import config loader and Supabase
import { getSupabaseConfig } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let supabase;

// Initialize Supabase with config from backend
async function initSupabase() {
    if (supabase) return supabase;
    
    try {
        const config = await getSupabaseConfig();
        supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
        console.log('✅ Supabase initialized');
        return supabase;
    } catch (error) {
        console.error('❌ Failed to initialize Supabase:', error);
        throw error;
    }
}

// Check if user is already logged in
async function checkAuth() {
    try {
        const sb = await initSupabase();
        const { data: { session } } = await sb.auth.getSession();
        
        if (session) {
            // User is logged in, redirect to dashboard
            window.location.href = '/dashboard.html';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
    }
}

// Run on page load
checkAuth();

// Google Sign In/Up
const googleLoginBtn = document.getElementById('google-login-btn');
const googleSignupBtn = document.getElementById('google-signup-btn');

if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        try {
            const sb = await initSupabase();
            const { data, error } = await sb.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/dashboard.html'
                }
            });
            
            if (error) throw error;
        } catch (error) {
            showError(error.message);
        }
    });
}

if (googleSignupBtn) {
    googleSignupBtn.addEventListener('click', async () => {
        try {
            const sb = await initSupabase();
            const { data, error } = await sb.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + '/dashboard.html'
                }
            });
            
            if (error) throw error;
        } catch (error) {
            showError(error.message);
        }
    });
}

// Email/Password Login
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        try {
            const sb = await initSupabase();
            const { data, error } = await sb.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) throw error;
            
            // Redirect to dashboard
            window.location.href = '/dashboard.html';
        } catch (error) {
            showError(error.message);
        }
    });
}

// Email/Password Signup
const signupForm = document.getElementById('signup-form');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        
        // Validate passwords match
        if (password !== confirmPassword) {
            showError('Passwords do not match!');
            return;
        }
        
        if (password.length < 6) {
            showError('Password must be at least 6 characters!');
            return;
        }
        
        try {
            const sb = await initSupabase();
            const { data, error } = await sb.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: window.location.origin + '/dashboard.html'
                }
            });
            
            if (error) throw error;
            
            showSuccess('Account created! Check your email to verify.');
            
            // Redirect after 2 seconds
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        } catch (error) {
            showError(error.message);
        }
    });
}

// Helper functions
function showError(message) {
    // Remove existing messages
    const existing = document.querySelector('.error-message, .success-message');
    if (existing) existing.remove();
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    const content = document.querySelector('.auth-content');
    content.insertBefore(errorDiv, content.firstChild);
}

function showSuccess(message) {
    // Remove existing messages
    const existing = document.querySelector('.error-message, .success-message');
    if (existing) existing.remove();
    
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    
    const content = document.querySelector('.auth-content');
    content.insertBefore(successDiv, content.firstChild);
}