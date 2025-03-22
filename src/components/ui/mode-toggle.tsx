import { Button } from '@/components/ui/button'
import { Laptop, Moon, Sun } from 'lucide-react'
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { Fragment, useState, useEffect } from 'react'

function ModeToggleSimple() {
  const [theme, setThemeState] = useState<'theme-light' | 'dark'>('theme-light')

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark')
    setThemeState(isDarkMode ? 'dark' : 'theme-light')
  }, [])

  useEffect(() => {
    document.documentElement.classList.add('disable-transitions')
    document.documentElement.classList[theme === 'dark' ? 'add' : 'remove']('dark')

    window.getComputedStyle(document.documentElement).getPropertyValue('opacity')

    requestAnimationFrame(() => {
      document.documentElement.classList.remove('disable-transitions')
    })
  }, [theme])

  const toggleTheme = () => {
    setThemeState(theme === 'dark' ? 'theme-light' : 'dark')
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="group"
      title="Toggle theme"
    >
      <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}

function ModeToggleV2() {
  const [theme, setThemeState] = useState<'theme-light' | 'dark' | 'system'>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Initial theme detection to check system preference
  useEffect(() => {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDarkMode = document.documentElement.classList.contains('dark')
    
    if (isDarkMode || systemDark) {
      setThemeState('system')
    } else {
      setThemeState('theme-light')
    }
  }, [])

  // Update theme effect to handle system preference changes
  useEffect(() => {
    const isDark =
      theme === 'dark' ||
      (theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)

    document.documentElement.classList.add('disable-transitions')
    document.documentElement.classList[isDark ? 'add' : 'remove']('dark')
    
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = (e: MediaQueryListEvent) => {
        document.documentElement.classList[e.matches ? 'add' : 'remove']('dark')
      }
      
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    requestAnimationFrame(() => {
      document.documentElement.classList.remove('disable-transitions')
    })
  }, [theme])

  // if (!mounted) return null

  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton
        as={Button}
        variant="outline"
        size="icon"
        className="group"
        title="Toggle theme"
      >
        <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </MenuButton>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <MenuItems className="absolute right-0 mt-2 w-32 origin-top-right rounded-md bg-background border shadow-lg focus:outline-none">
          <div className="px-1 py-1">
            <MenuItem>
              {({ focus }) => (
                <button
                  onClick={() => setThemeState('theme-light')}
                  className={`${
                    focus ? 'bg-secondary/50' : ''
                  } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                >
                  <Sun className="mr-2 size-4" />
                  <span>Light</span>
                </button>
              )}
            </MenuItem>
            <MenuItem>
              {({ focus }) => (
                <button
                  onClick={() => setThemeState('dark')}
                  className={`${
                    focus ? 'bg-secondary/50' : ''
                  } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                >
                  <Moon className="mr-2 size-4" />
                  <span>Dark</span>
                </button>
              )}
            </MenuItem>
            <MenuItem>
              {({ focus }) => (
                <button
                  onClick={() => setThemeState('system')}
                  className={`${
                    focus ? 'bg-secondary/50' : ''
                  } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                >
                  <Laptop className="mr-2 size-4" />
                  <span>System</span>
                </button>
              )}
            </MenuItem>
          </div>
        </MenuItems>
      </Transition>
    </Menu>
  )
}

export { ModeToggleSimple, ModeToggleV2 }
