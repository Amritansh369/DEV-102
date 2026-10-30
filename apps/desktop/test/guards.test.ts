import { afterEach, describe, expect, it, vi } from 'vitest'

const clipboard = vi.hoisted(() => ({ clear: vi.fn(), readText: vi.fn(() => ''), readImage: vi.fn(() => ({ isEmpty: () => true })) }))
vi.mock('electron', () => ({ clipboard, screen: { on: vi.fn(), off: vi.fn(), removeListener: vi.fn(), getAllDisplays: () => [] } }))
vi.mock('systeminformation', () => ({
  default: {
    usb: async () => [],
    blockDevices: async () => [],
    processes: async () => ({ list: [{ name: 'claude.exe', pid: 11 }, { name: 'Cursor.exe', pid: 12 }, { name: 'AnyDesk.exe', pid: 13 }, { name: 'notepad.exe', pid: 14 }] }),
  },
}))

const { GuardMonitor, scanProcesses, setRelaxed } = await import('../electron/security/guards')

afterEach(() => setRelaxed(false))

describe('clipboard', () => {
  it('reports what was copied and leaves the clipboard alone', async () => {
    vi.useFakeTimers()
    const emit = vi.fn()
    const monitor = new GuardMonitor(emit)
    await monitor.start()
    clipboard.readText.mockReturnValue('Which of these is a NoSQL database?')
    await vi.advanceTimersByTimeAsync(1600)
    monitor.stop()
    vi.useRealTimers()
    clipboard.readText.mockReturnValue('')
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLIPBOARD_USE', message: 'Copied: "Which of these is a NoSQL database?"' }))
    expect(clipboard.clear).not.toHaveBeenCalled()
  })
})

describe('developer mode (relaxed)', () => {
  it('flags coding assistants in strict builds', async () => {
    const ids = (await scanProcesses()).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['app-claude', 'app-cursor', 'app-anydesk']))
  })

  it('leaves coding assistants out in development but still lists other blacklisted apps', async () => {
    setRelaxed(true)
    const ids = (await scanProcesses()).map((a) => a.id)
    expect(ids).toEqual(['app-anydesk'])
  })

  it('starts no native guards in development', async () => {
    setRelaxed(true)
    const emit = vi.fn()
    const monitor = new GuardMonitor(emit)
    await monitor.start()
    expect(clipboard.clear).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
    monitor.stop()
  })
})
