import React, { ReactNode, useEffect, useState } from 'react';

interface SidebarProps {
    children: ReactNode;
    position?: 'left' | 'right';
}

const SidebarComponent: React.FC<SidebarProps> = ({ children, position = 'left' }) => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
        () => position === 'right' || (
            typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
        )
    );

    useEffect(() => {
        const mobileQuery = window.matchMedia('(max-width: 760px)');
        const updateForViewport = (event: MediaQueryListEvent) => {
            setIsSidebarCollapsed(event.matches || position === 'right');
        };

        mobileQuery.addEventListener('change', updateForViewport);
        return () => mobileQuery.removeEventListener('change', updateForViewport);
    }, [position]);

    const toggleSidebar = () => {
        setIsSidebarCollapsed((collapsed) => !collapsed);
    };

    const isLeft = position === 'left';
    const collapseIcon = isSidebarCollapsed 
        ? (isLeft ? '>' : '<') 
        : (isLeft ? '<' : '>');

    return (
        <div className={`sidebar-box ${position}`}>
            <div className={`sidebar ${position}${isSidebarCollapsed ? ' collapsed' : ''}`}>
                <div className={`sidebar-content ${isSidebarCollapsed ? 'sidebar-content--disabled' : ''}`}>
                    {children}
                </div>
            </div>
            <button
                className={`collapse ${position}`}
                onClick={toggleSidebar}
                aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                type="button"
            >
                {collapseIcon}
            </button>
        </div>
    );
};

export const Sidebar = React.memo(SidebarComponent);
