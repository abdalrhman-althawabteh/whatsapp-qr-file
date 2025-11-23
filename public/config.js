// public/config.js
// Configuration loader for frontend

let supabaseConfig = null;

async function getSupabaseConfig() {
    if (supabaseConfig) {
        return supabaseConfig;
    }
    
    try {
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status}`);
        }
        
        supabaseConfig = await response.json();
        return supabaseConfig;
    } catch (error) {
        console.error('❌ Failed to load Supabase config:', error);
        throw error;
    }
}

// Export for ES modules
export { getSupabaseConfig };