import { useEffect, useState, useCallback, useRef } from 'react';
import EnterOrExitCard from './components/EnterOrExitCard';
import InfoCard from './components/InfoCard';
import { io } from 'socket.io-client';
import { Grid, GridItem, Text, Flex, Box, Image, Button } from '@chakra-ui/react';
import PanicAlertModal from './components/PanicAlertModal';
import ConfigurationModal from './components/ConfigurationModal';
import { loadConfig, saveConfig } from './utils/configStorage';

const socket = io.connect(import.meta.env.VITE_HOST);

// Creamos una instancia de Audio para el sonido de alerta
const alertSound = new Audio('/sound/alarm.mp3');

function App() {
  const [entryEvent, setEntryEvent] = useState(null);
  const [exitEvent, setExitEvent] = useState(null);
  const [entryHistory, setEntryHistory] = useState([]);
  const [exitHistory, setExitHistory] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [currentPanicEvent, setCurrentPanicEvent] = useState(null);
  const [config, setConfig] = useState(loadConfig());
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const entryDisplayTimeoutRef = useRef(null);
  const exitDisplayTimeoutRef = useRef(null);

  // Función para manejar el auto-hide de eventos
  const setupAutoHide = useCallback((eventType, setEventFunction) => {
    // Limpiar timeout anterior si existe
    if (eventType === 'entry' && entryDisplayTimeoutRef.current) {
      clearTimeout(entryDisplayTimeoutRef.current);
      entryDisplayTimeoutRef.current = null;
    }
    if (eventType === 'exit' && exitDisplayTimeoutRef.current) {
      clearTimeout(exitDisplayTimeoutRef.current);
      exitDisplayTimeoutRef.current = null;
    }

    // Si no está configurado para mostrar siempre, configurar auto-hide
    if (config.displayTime !== 'always') {
      const timeout = setTimeout(() => {
        setEventFunction(null);
        if (eventType === 'entry') {
          entryDisplayTimeoutRef.current = null;
        } else {
          exitDisplayTimeoutRef.current = null;
        }
      }, config.displayTime * 1000);
      
      if (eventType === 'entry') {
        entryDisplayTimeoutRef.current = timeout;
      } else {
        exitDisplayTimeoutRef.current = timeout;
      }
    }
  }, [config.displayTime]);

  // Función para manejar cambios en la configuración
  const handleConfigChange = (newConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  useEffect(() => {
    socket.on('connect', () => {
      console.log(socket.id);
    });
    const handleAccessControlEvent = (data) => {
      const parsedData = JSON.parse(data);

      const currentDateTime = new Date();

      // Formatear fecha como DD/MM/YYYY
      const fecha = currentDateTime.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      // Formatear hora como HH:MM:SS
      const hora = currentDateTime.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      // Añadir fecha y hora al objeto parsedData
      parsedData.fecha = fecha;
      parsedData.hora = hora;

      const eventWithDateTime = {
        event: parsedData,
        dateTime: currentDateTime,
      };

      if (parsedData.event_type === 'ENTRY') {
        setEntryEvent((currentEntryEvent) => {
          if (currentEntryEvent) {
            setEntryHistory((prevHistory) => [
              currentEntryEvent,
              ...prevHistory.slice(0, 10),
            ]);
          }
          return eventWithDateTime;
        });
        setupAutoHide('entry', setEntryEvent);

        // Verificamos si es un evento de pánico y actualizamos el estado isOpen
        if (parsedData.isPanic === '1') {
          setIsOpen(true);
          setCurrentPanicEvent(parsedData);
        }
      } else if (parsedData.event_type === 'EXIT') {
        setExitEvent((currentExitEvent) => {
          if (currentExitEvent) {
            setExitHistory((prevHistory) => [
              currentExitEvent,
              ...prevHistory.slice(0, 10),
            ]);
          }
          return eventWithDateTime;
        });
        setupAutoHide('exit', setExitEvent);

        // Verificamos si es un evento de pánico y actualizamos el estado isOpen
        if (parsedData.isPanic === '1') {
          setIsOpen(true);
          setCurrentPanicEvent(parsedData);
        }
      }
    };
    socket.on('accessControlEvent', handleAccessControlEvent);

    return () => {
      socket.off('accessControlEvent', handleAccessControlEvent);
    };
  }, [setupAutoHide]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (entryDisplayTimeoutRef.current) {
        clearTimeout(entryDisplayTimeoutRef.current);
      }
      if (exitDisplayTimeoutRef.current) {
        clearTimeout(exitDisplayTimeoutRef.current);
      }
    };
  }, []);

  const onClose = () => {
    setIsOpen(false);
    // También podríamos detener el sonido aquí si es necesario
    alertSound.pause();
    alertSound.currentTime = 0;
  };

  // Efecto para reproducir el sonido cuando el modal está abierto (isOpen=true)
  useEffect(() => {
    let timeoutId = null;

    const scheduleNextPlay = () => {
      // Esperar 15 segundos después de que termine el sonido antes de reproducirlo nuevamente
      timeoutId = setTimeout(() => {
        if (isOpen) {
          alertSound.play().catch((error) => {
            console.error('Error al reproducir el sonido de alerta:', error);
          });
        }
      }, 15000); // 15 segundos de espera
    };

    // Función para manejar cuando el sonido termina
    const handleSoundEnded = () => {
      scheduleNextPlay();
    };

    if (isOpen) {
      // Reproducir inmediatamente cuando se abre el modal
      alertSound.play().catch((error) => {
        console.error('Error al reproducir el sonido de alerta:', error);
      });

      // Configurar el evento para cuando termine el sonido
      alertSound.addEventListener('ended', handleSoundEnded);
    }

    // Limpieza al desmontar el componente
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      alertSound.removeEventListener('ended', handleSoundEnded);
      alertSound.pause();
      alertSound.currentTime = 0;
    };
  }, [isOpen]); // Se ejecuta cuando cambia el estado isOpen

  return (
    <Grid
      templateColumns='170px 1fr 170px'
      templateRows='100vh'
      fontFamily='poppins'
      overflow='hidden'
      position='relative'
    >
      {/* Un solo PanicAlertModal controlado por isOpen */}
      {isOpen && currentPanicEvent && (
        <PanicAlertModal
          isOpen={isOpen}
          onClose={onClose}
          data={currentPanicEvent}
        />
      )}

      {/* Configuration Modal */}
      <ConfigurationModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={config}
        onConfigChange={handleConfigChange}
      />

      {/* Configuration Button */}
      <Button
        position="absolute"
        top={4}
        right="180px"
        zIndex={10}
        bg="#035187"
        color="white"
        _hover={{ bg: "#024066" }}
        onClick={() => setIsConfigOpen(true)}
        size="sm"
        fontFamily="poppins"
        fontSize="12px"
      >
        ⚙️ Config
      </Button>

      <GridItem
        borderColor='#035187'
        borderRightWidth={2}
        borderTopRightRadius={18}
      >
        <Text
          fontSize={18}
          textAlign='center'
          bg='#035187'
          borderTopRightRadius={18}
          p={2}
          color='white'
          mb={2}
          fontFamily='poppins'
        >
          Últimos ingresos
        </Text>
        {config.entry.showRecentMovements && entryHistory.map((event, index) => (
          <InfoCard
            key={`entry-${index}`}
            name={event.event.name}
            batch={`Lote ${event.event.lote}, UF ${event.event.UF}`}
            dateTime={event.dateTime.toLocaleString()}
            category_id={event.event.category_id}
            config={config}
            type="entry"
          />
        ))}
      </GridItem>
      <GridItem>
        <Flex justifyContent='center'>
          <Image src='/logo.svg' mt={2} h='50px' />
        </Flex>
        <Flex h='100%' mt={6}>
          <Box flex='1' pl={16} mr={10}>
            <Flex alignItems='center'>
              <Image src='/SignIn.svg' alt='Face-id img' h={8} mr={2} />
              <Text
                fontWeight={500}
                fontSize={{
                  xl: '22px',
                  '2xl': '26px',
                }}
              >
                Ingresando
              </Text>
            </Flex>
            {/* ENTRY */}
            {entryEvent && (
              <EnterOrExitCard 
                event={entryEvent.event} 
                config={config}
                type="entry"
              />
            )}
          </Box>
          <Box flex='1' pr={16}>
            <Flex alignItems='center'>
              <Image src='/SignOut.svg' alt='Face-id img' h={8} mr={2} />
              <Text
                fontSize={{
                  xl: '22px',
                  '2xl': '26px',
                }}
                fontWeight={500}
              >
                Egresando
              </Text>
            </Flex>

            {/* EXIT */}
            {exitEvent && (
              <EnterOrExitCard 
                event={exitEvent.event} 
                config={config}
                type="exit"
              />
            )}
          </Box>
        </Flex>
      </GridItem>
      <GridItem
        borderColor='#035187'
        borderLeftWidth={2}
        borderTopLeftRadius={18}
      >
        <Text
          fontSize={18}
          textAlign='center'
          bg='#035187'
          borderTopLeftRadius={18}
          p={2}
          color='white'
          mb={2}
          fontFamily='poppins'
        >
          Últimos egresos
        </Text>
        {config.exit.showRecentMovements && exitHistory.map((event, index) => (
          <InfoCard
            key={`exit-${index}`}
            name={event.event.name}
            batch={`Lote ${event.event.lote}, UF ${event.event.UF}`}
            category_id={event.event.category_id}
            dateTime={event.dateTime.toLocaleString()}
            config={config}
            type="exit"
          />
        ))}
      </GridItem>
    </Grid>
  );
}

export default App;
