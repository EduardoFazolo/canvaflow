import { useEffect, useState } from 'react'
import { pluginRegistry } from '../../../plugins/types'

/**
 * Returns the plugin registry's version counter.
 * Re-renders the component whenever a plugin is registered or unregistered.
 */
export function usePluginRegistryVersion(): number {
  const [version, setVersion] = useState(pluginRegistry.version)

  useEffect(() => {
    return pluginRegistry.onChanged(() => {
      setVersion(pluginRegistry.version)
    })
  }, [])

  return version
}
