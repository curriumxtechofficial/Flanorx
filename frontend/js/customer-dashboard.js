/**
 * Flanorx Customer Dashboard - Mobile Navigation
 * Handles mobile bottom navigation and active states
 */

document.addEventListener('DOMContentLoaded', function() {
    const body = document.body;

    // Handle window resize - ensure proper display on desktop/mobile
    window.addEventListener('resize', function() {
        // Any resize handling if needed in the future
    });

    // Set active state for bottom navigation based on current page
    function setActiveBottomNav() {
        const path = window.location.pathname;
        let current = path.substring(path.lastIndexOf("/") + 1);
        
        // Default to home for empty paths or dashboard
        if (
            current === "" ||
            current === "index.html" ||
            current === "customer-dashboard.html" ||
            current === "#"
        ) {
            current = "home";
        }

        // Remove active class from all bottom nav items
        const navItems = document.querySelectorAll('.bottom-nav-item');
        navItems.forEach(item => item.classList.remove('active'));

        // Add active class to current page
        navItems.forEach(item => {
            const href = item.getAttribute('href');
            if ((current === "home" && href === "#") || href === current) {
                item.classList.add('active');
            }
        });
    }

    // Call on load
    setActiveBottomNav();

    // Optional: Add touch feedback for bottom nav items
    const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
    bottomNavItems.forEach(item => {
        item.addEventListener('touchstart', function() {
            this.style.opacity = '0.7';
        }, { passive: true });
        
        item.addEventListener('touchend', function() {
            this.style.opacity = '1';
        }, { passive: true });
        
        item.addEventListener('touchcancel', function() {
            this.style.opacity = '1';
        }, { passive: true });
    });

    // Handle iOS safe area for bottom navigation
    function updateBottomNavPadding() {
        const bottomNav = document.querySelector('.mobile-bottom-nav');
        if (bottomNav) {
            // Check if we're on iOS and if safe area is available
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            if (isIOS && window.visualViewport) {
                const bottomPadding = window.innerHeight - window.visualViewport.height;
                bottomNav.style.paddingBottom = `${Math.max(bottomPadding, 0)}px`;
            }
        }
    }

    // Call on load and resize
    updateBottomNavPadding();
    window.addEventListener('resize', updateBottomNavPadding);
    window.visualViewport?.addEventListener('resize', updateBottomNavPadding);
});