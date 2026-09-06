import { Icon } from '../ui/Icon';
import { icons } from '../ui/icons';
import { useEffect, useState } from 'preact/hooks';

interface NavigationItem {
    id: string;
    href: string;
    label: string;
    icon: string;
    target?: '_blank';
    hidden?: boolean;
}

const primaryItems: NavigationItem[] = [
    { id: 'sidebar-nav-home', href: '/', label: 'Home', icon: icons.house },
    { id: 'sidebar-nav-library', href: '/library', label: 'Library', icon: icons.library },
    { id: 'sidebar-nav-playlists', href: '/library?tab=playlists', label: 'Playlists', icon: icons.list },
    { id: 'sidebar-nav-starred', href: '/library?tab=tracks', label: 'Starred', icon: icons.heart },
    { id: 'sidebar-nav-recent', href: '/recent', label: 'Recent', icon: icons.recent },
];

const secondaryItems: NavigationItem[] = [
    { id: 'sidebar-nav-settings', href: '/settings', label: 'Settings', icon: icons.settings },
    { id: 'sidebar-nav-about-bottom', href: '/about', label: 'About', icon: icons.info },
    {
        id: 'sidebar-nav-githubbtn',
        href: 'https://github.com/lozza/monochrome-navidrome',
        label: 'GitHub',
        icon: icons.github,
        target: '_blank',
        hidden: true,
    },
];

function isCurrentPath(pathname: string, href: string) {
    const [path, query] = href.split('?');
    const [currentPath, currentQuery] = pathname.split('?');
    if (path === '/') return currentPath === '/' || currentPath === '/home';
    if (!path.startsWith('/')) return false;
    if (query && currentQuery !== query) return false;
    if (!query && currentQuery && path === '/library') return false;
    return currentPath === path || currentPath.startsWith(`${path}/`);
}

function usePathname() {
    const [pathname, setPathname] = useState(() => `${window.location.pathname}${window.location.search}`);

    useEffect(() => {
        const update = () => setPathname(`${window.location.pathname}${window.location.search}`);
        window.addEventListener('popstate', update);
        return () => window.removeEventListener('popstate', update);
    }, []);

    return pathname;
}

function NavigationList({ items, pathname }: { items: NavigationItem[]; pathname: string }) {
    return (
        <ul>
            {items.map((item) => {
                const active = isCurrentPath(pathname, item.href);
                return (
                    <li
                        className={`nav-item${active ? ' active' : ''}`}
                        id={item.id}
                        key={item.id}
                        style={item.hidden ? { display: 'none' } : undefined}
                    >
                        <a
                            aria-current={active ? 'page' : undefined}
                            href={item.href}
                            rel={item.target ? 'noreferrer' : undefined}
                            target={item.target}
                        >
                            <Icon svg={item.icon} size={20} />
                            <span>{item.label}</span>
                        </a>
                    </li>
                );
            })}
        </ul>
    );
}

export function AppNavigation() {
    const pathname = usePathname();

    const openMore = () => {
        document.getElementById('hamburger-btn')?.click();
    };

    return (
        <>
            <div className="sidebar-logo">
                <a aria-label="Navichrome home" className="sidebar-logo-link" href="/">
                    <Icon className="app-logo" svg={icons.logo} size={22} />
                    <span>Navichrome</span>
                </a>
                <button
                    aria-label="Collapse sidebar"
                    className="btn-icon desktop-only"
                    id="sidebar-toggle"
                    title="Collapse sidebar"
                    type="button"
                >
                    <Icon svg={icons.chevronLeft} />
                </button>
            </div>

            <nav aria-label="Primary" className="sidebar-nav main">
                <NavigationList items={primaryItems} pathname={pathname} />
            </nav>

            <div className="sidebar-bottom-container">
                <nav
                    aria-label="Pinned music"
                    className="sidebar-nav"
                    id="pinned-items-nav"
                    style={{ display: 'none' }}
                >
                    <h2 className="pinned-items-header">Pinned</h2>
                    <ul id="pinned-items-list" />
                </nav>

                <div className="sidebar-nav-bottom">
                    <nav aria-label="More" className="sidebar-nav bottom">
                        <NavigationList items={secondaryItems} pathname={pathname} />
                    </nav>
                </div>
            </div>

            <nav aria-label="Mobile navigation" className="mobile-bottom-nav">
                <a href="/" aria-current={isCurrentPath(pathname, '/') ? 'page' : undefined}>
                    <Icon svg={icons.house} size={20} />
                    <span>Home</span>
                </a>
                <a href="/search" aria-current={isCurrentPath(pathname, '/search') ? 'page' : undefined}>
                    <Icon svg={icons.search} size={20} />
                    <span>Search</span>
                </a>
                <a href="/library" aria-current={isCurrentPath(pathname, '/library') ? 'page' : undefined}>
                    <Icon svg={icons.library} size={20} />
                    <span>Library</span>
                </a>
                <a
                    href="/library?tab=tracks"
                    aria-current={isCurrentPath(pathname, '/library?tab=tracks') ? 'page' : undefined}
                >
                    <Icon svg={icons.heart} size={20} />
                    <span>Starred</span>
                </a>
                <button aria-label="More navigation" onClick={openMore} type="button">
                    <Icon svg={icons.menu} size={20} />
                    <span>More</span>
                </button>
            </nav>
        </>
    );
}
