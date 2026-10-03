const CONFIG_STORAGE_KEY = 'access-control-config';

const defaultConfig = {
  displayTime: 'always',
  // Lista de DNI/documentos (separados por coma) para los que se muestra un
  // avatar genérico en vez de la foto real en las tarjetas de entrada/salida.
  hiddenPhotoDocuments: '',
  entry: {
    showPhoto: true,
    showName: true,
    showCategory: true,
    showLoteUF: true,
    showRecentMovements: true
  },
  exit: {
    showPhoto: true,
    showName: true,
    showCategory: true,
    showLoteUF: true,
    showRecentMovements: true
  }
};

export const loadConfig = () => {
  try {
    const savedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (savedConfig) {
      const parsedConfig = JSON.parse(savedConfig);
      // Merge with default config to ensure all properties exist
      return {
        ...defaultConfig,
        ...parsedConfig,
        entry: {
          ...defaultConfig.entry,
          ...parsedConfig.entry
        },
        exit: {
          ...defaultConfig.exit,
          ...parsedConfig.exit
        }
      };
    }
  } catch (error) {
    console.error('Error loading config from localStorage:', error);
  }
  return defaultConfig;
};

export const saveConfig = (config) => {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Error saving config to localStorage:', error);
  }
};

export { defaultConfig };