// Config propia de la pantalla de la ficha (/ficha) - independiente de la
// del dashboard de entradas/salidas (configStorage.js), porque suelen ser
// pantallas/PCs distintas. Mismos parámetros que esa, más
// selectedFaceIdDevices (lista vacía = mostrar todos los equipos).
const CONFIG_STORAGE_KEY = 'access-control-ficha-config';

const defaultConfig = {
  displayTime: 'always',
  hiddenPhotoDocuments: '',
  selectedFaceIdDevices: [],
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

export const loadFichaConfig = () => {
  try {
    const savedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (savedConfig) {
      const parsedConfig = JSON.parse(savedConfig);
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
        },
        selectedFaceIdDevices: Array.isArray(parsedConfig.selectedFaceIdDevices)
          ? parsedConfig.selectedFaceIdDevices
          : defaultConfig.selectedFaceIdDevices,
      };
    }
  } catch (error) {
    console.error('Error loading ficha config from localStorage:', error);
  }
  return defaultConfig;
};

export const saveFichaConfig = (config) => {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Error saving ficha config to localStorage:', error);
  }
};

export { defaultConfig as defaultFichaConfig };
