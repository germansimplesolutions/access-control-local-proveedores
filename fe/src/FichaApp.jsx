import { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { Box, Image, Button, Center } from '@chakra-ui/react';
import ConfigurationModal from './components/ConfigurationModal';
import FichaCard from './components/FichaCard';
import { loadFichaConfig, saveFichaConfig } from './utils/fichaConfigStorage';

const socket = io.connect(import.meta.env.VITE_HOST);
const API_BASE = import.meta.env.VITE_HOST;

function FichaApp() {
  const [config, setConfig] = useState(loadFichaConfig());
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [deviceOptions, setDeviceOptions] = useState([]);
  const [currentFicha, setCurrentFicha] = useState(null);
  const [currentPhoto, setCurrentPhoto] = useState(null);
  const hideTimeoutRef = useRef(null);

  const handleConfigChange = (newConfig) => {
    setConfig(newConfig);
    saveFichaConfig(newConfig);
  };

  // Lista de equipos Face ID configurados, para el selector en Config.
  useEffect(() => {
    fetch(`${API_BASE}/api/devices`)
      .then((res) => res.json())
      .then((data) => setDeviceOptions(data.devices || []))
      .catch((error) => console.error('Error obteniendo la lista de equipos:', error));
  }, []);

  const matchesSelectedDevices = useCallback((deviceName) => {
    if (!config.selectedFaceIdDevices || config.selectedFaceIdDevices.length === 0) {
      return true; // sin seleccion = mostrar todos los equipos
    }
    return config.selectedFaceIdDevices.includes(deviceName);
  }, [config.selectedFaceIdDevices]);

  const scheduleAutoHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (config.displayTime !== 'always') {
      hideTimeoutRef.current = setTimeout(() => {
        setCurrentFicha(null);
        setCurrentPhoto(null);
      }, config.displayTime * 1000);
    }
  }, [config.displayTime]);

  useEffect(() => {
    const handleAccessControlEvent = (data) => {
      const parsedData = JSON.parse(data);

      if (!matchesSelectedDevices(parsedData.deviceName)) return;

      // La foto de la persona identificada viaja en el propio evento (la
      // pone el backend en getUser/getPictureFromLocal|FaceID segun
      // PHOTO_SOURCE) - es un base64 sin el prefijo "data:", asi que FichaCard
      // la antepone antes de usarla como src de una imagen.
      setCurrentPhoto(parsedData.picture || null);

      fetch(`${API_BASE}/api/ficha/${parsedData.id}`)
        .then((res) => res.json())
        .then((ficha) => {
          setCurrentFicha(ficha);
          scheduleAutoHide();
        })
        .catch((error) => console.error('Error obteniendo la ficha:', error));
    };

    socket.on('accessControlEvent', handleAccessControlEvent);

    return () => {
      socket.off('accessControlEvent', handleAccessControlEvent);
    };
  }, [matchesSelectedDevices, scheduleAutoHide]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  return (
    <Box minH="100vh" bg="#F4F6F8" fontFamily="poppins" position="relative" p={8}>
      <ConfigurationModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={config}
        onConfigChange={handleConfigChange}
        deviceOptions={deviceOptions}
      />

      <Button
        position="absolute"
        top={4}
        right={4}
        zIndex={10}
        bg="#035187"
        color="white"
        _hover={{ bg: '#024066' }}
        onClick={() => setIsConfigOpen(true)}
        size="sm"
        fontFamily="poppins"
        fontSize="12px"
      >
        ⚙️ Config
      </Button>

      {!currentFicha ? (
        // Pantalla en reposo: mientras no hay nadie identificándose (al
        // iniciar, o pasado el tiempo configurado en "Mostrar
        // información"), se muestra el logo grande en vez de dejar la
        // pantalla con un texto chico - pensado para pantallas que quedan
        // mirando al público/entrada. Fuera del Box angosto de abajo a
        // propósito, para que pueda ocupar bien el centro de la pantalla.
        <Center minH="60vh">
          <Image src="/idle-background.png" maxW="90vw" w="720px" />
        </Center>
      ) : (
        <Center>
          <Box w="100%" maxW="680px">
            {currentFicha && <FichaCard ficha={currentFicha} photo={currentPhoto} />}
          </Box>
        </Center>
      )}
    </Box>
  );
}

export default FichaApp;
