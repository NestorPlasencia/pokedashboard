import React, { ReactNode } from 'react';

interface SidebarProps {
    children: ReactNode;
    position?: 'left' | 'right';
    /** Owned by the caller so the bottom dock and this sidebar's own arrow drive the same state. */
    collapsed: boolean;
    onToggle: () => void;
}

const SidebarComponent: React.FC<SidebarProps> = ({ children, position = 'left', collapsed, onToggle }) => {
    const isLeft = position === 'left';
    const collapseIcon = collapsed
        ? (isLeft ? '>' : '<')
        : (isLeft ? '<' : '>');

    return (
        <div className={`sidebar-box ${position}`}>
            <div className={`sidebar ${position}${collapsed ? ' collapsed' : ''}`}>
                <div className={`sidebar-content ${collapsed ? 'sidebar-content--disabled' : ''}`}>
                    {children}
                </div>
            </div>
            <button
                className={`collapse ${position}`}
                onClick={onToggle}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                type="button"
            >
                {collapseIcon}
            </button>
        </div>
    );
};

export const Sidebar = React.memo(SidebarComponent);
