import React, { ReactNode, useState } from 'react';

interface SidebarProps {
    children: ReactNode;
    position?: 'left' | 'right';
}

const SidebarComponent: React.FC<SidebarProps> = ({ children, position = 'left' }) => {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const toggleSidebar = () => {
        setIsSidebarCollapsed(!isSidebarCollapsed);
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
