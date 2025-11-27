export class Tabs {
    constructor(tabSelector, contentSelector, options = {}) {
        this.tabs = document.querySelectorAll(tabSelector);
        this.contents = document.querySelectorAll(contentSelector);
        this.options = {
            activeClass: 'active',
            defaultTab: 0,
            onTabChange: null,
            ...options
        };

        this.init();
    }

    init() {
        this.tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => {
                this.activate(index);
            });
        });

        // Activate default tab if specified and no active tab exists
        if (this.options.defaultTab !== null && !document.querySelector(`${this.options.tabSelector}.${this.options.activeClass}`)) {
            this.activate(this.options.defaultTab);
        }
    }

    activate(indexOrElement) {
        let targetIndex = -1;

        if (typeof indexOrElement === 'number') {
            targetIndex = indexOrElement;
        } else {
            // Assume element
            this.tabs.forEach((t, i) => {
                if (t === indexOrElement) targetIndex = i;
            });
        }

        if (targetIndex === -1 || targetIndex >= this.tabs.length) return;

        const selectedTab = this.tabs[targetIndex];
        const targetId = selectedTab.getAttribute('data-target');

        // Deactivate all
        this.tabs.forEach(t => t.classList.remove(this.options.activeClass));
        this.contents.forEach(c => c.classList.remove(this.options.activeClass));

        // Activate selected
        selectedTab.classList.add(this.options.activeClass);
        
        // Find content by ID (preferred) or index
        let targetContent = null;
        if (targetId) {
            targetContent = document.getElementById(targetId);
        } else if (this.contents[targetIndex]) {
            targetContent = this.contents[targetIndex];
        }

        if (targetContent) {
            targetContent.classList.add(this.options.activeClass);
        }

        if (this.options.onTabChange) {
            this.options.onTabChange(selectedTab, targetContent);
        }
    }
}
