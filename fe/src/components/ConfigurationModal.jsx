import PropTypes from 'prop-types';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  FormControl,
  FormLabel,
  Select,
  Checkbox,
  Textarea,
  VStack,
  HStack,
  Box,
  Text,
  Divider,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';

const ConfigurationModal = ({ isOpen, onClose, config, onConfigChange, deviceOptions }) => {
  const [localConfig, setLocalConfig] = useState(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  // Tab nueva (solo en el front de la ficha, cuando se le pasa
  // deviceOptions): elegir uno o mas equipos Face ID cuya informacion se
  // quiere ver en esta pantalla. Lista vacia = mostrar todos los equipos.
  const hasDeviceSelection = Array.isArray(deviceOptions) && deviceOptions.length > 0;

  const toggleSelectedDevice = (deviceName, checked) => {
    setLocalConfig((prev) => {
      const current = Array.isArray(prev.selectedFaceIdDevices) ? prev.selectedFaceIdDevices : [];
      // Lista vacia = "se muestran todos" (ver fichaConfigStorage.js), y en
      // ese estado el tab de abajo muestra TODOS los checkboxes tildados
      // (ver isChecked mas abajo). Si el usuario destilda un equipo
      // partiendo de ahi, hay que pasar a una lista explicita con todos los
      // equipos MENOS el que acaba de destildar - filtrar directo sobre el
      // array vacio no sacaba nada (ese era el bug: destildar no tenia
      // ningun efecto visible).
      const effectiveCurrent = current.length === 0 ? [...deviceOptions] : current;
      const next = checked
        ? [...new Set([...effectiveCurrent, deviceName])]
        : effectiveCurrent.filter((d) => d !== deviceName);
      return { ...prev, selectedFaceIdDevices: next };
    });
  };

  const handleDisplayTimeChange = (value) => {
    setLocalConfig(prev => ({
      ...prev,
      displayTime: value
    }));
  };

  const handleVisibilityChange = (section, field, value) => {
    setLocalConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleHiddenPhotoDocumentsChange = (value) => {
    setLocalConfig(prev => ({
      ...prev,
      hiddenPhotoDocuments: value
    }));
  };

  const handleSave = () => {
    onConfigChange(localConfig);
    onClose();
  };

  const handleCancel = () => {
    setLocalConfig(config);
    onClose();
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let i = 10; i <= 120; i += 10) {
      options.push(
        <option key={i} value={i}>
          {i} segundos
        </option>
      );
    }
    return options;
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} size="2xl" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader
          bg="#035187"
          color="white"
          textAlign="center"
          fontFamily="poppins"
        >
          Configuración del Sistema
        </ModalHeader>

        <ModalBody p={6}>
          <Tabs variant="enclosed" colorScheme="blue">
            <TabList>
              <Tab fontFamily="poppins">Tiempo de Visualización</Tab>
              <Tab fontFamily="poppins">Información en Pantalla</Tab>
              <Tab fontFamily="poppins">Privacidad de fotos</Tab>
              {hasDeviceSelection && (
                <Tab fontFamily="poppins">Equipos Face ID</Tab>
              )}
            </TabList>

            <TabPanels>
              {/* Tab de Tiempo de Visualización */}
              <TabPanel>
                <VStack spacing={4} align="start">
                  <Text fontSize="lg" fontWeight="500" fontFamily="poppins">
                    Configuración: Tiempo de visualización de información en pantalla
                  </Text>
                  
                  <FormControl>
                    <FormLabel fontFamily="poppins">Mostrar información:</FormLabel>
                    <Select
                      value={localConfig.displayTime === 'always' ? 'always' : 'timed'}
                      onChange={(e) => {
                        if (e.target.value === 'always') {
                          handleDisplayTimeChange('always');
                        } else {
                          handleDisplayTimeChange(10);
                        }
                      }}
                      fontFamily="poppins"
                    >
                      <option value="always">Mostrar siempre</option>
                      <option value="timed">Mostrar por tiempo</option>
                    </Select>
                  </FormControl>

                  {localConfig.displayTime !== 'always' && (
                    <FormControl>
                      <FormLabel fontFamily="poppins">Duración:</FormLabel>
                      <Select
                        value={localConfig.displayTime}
                        onChange={(e) => handleDisplayTimeChange(parseInt(e.target.value))}
                        fontFamily="poppins"
                      >
                        {generateTimeOptions()}
                      </Select>
                    </FormControl>
                  )}
                </VStack>
              </TabPanel>

              {/* Tab de Información en Pantalla */}
              <TabPanel>
                <VStack spacing={6} align="start">
                  <Text fontSize="lg" fontWeight="500" fontFamily="poppins">
                    Configuración: Información que se muestra en pantalla
                  </Text>

                  {/* Configuración para Ingresos */}
                  <Box w="100%">
                    <Text fontSize="md" fontWeight="500" mb={3} fontFamily="poppins" color="#035187">
                      Ingresos
                    </Text>
                    <VStack spacing={2} align="start" pl={4}>
                      <Checkbox
                        isChecked={localConfig.entry.showPhoto}
                        onChange={(e) => handleVisibilityChange('entry', 'showPhoto', e.target.checked)}
                        fontFamily="poppins"
                      >
                        Mostrar foto
                      </Checkbox>
                      <Checkbox
                        isChecked={localConfig.entry.showName}
                        onChange={(e) => handleVisibilityChange('entry', 'showName', e.target.checked)}
                        fontFamily="poppins"
                      >
                        Mostrar Nombre
                      </Checkbox>
                      <Checkbox
                        isChecked={localConfig.entry.showCategory}
                        onChange={(e) => handleVisibilityChange('entry', 'showCategory', e.target.checked)}
                        fontFamily="poppins"
                      >
                        Mostrar categoría
                      </Checkbox>
                      <Checkbox
                        isChecked={localConfig.entry.showLoteUF}
                        onChange={(e) => handleVisibilityChange('entry', 'showLoteUF', e.target.checked)}
                        fontFamily="poppins"
                      >
                        Mostrar Lote UF
                      </Checkbox>
                      <Checkbox
                        isChecked={localConfig.entry.showRecentMovements}
                        onChange={(e) => handleVisibilityChange('entry', 'showRecentMovements', e.target.checked)}
                        fontFamily="poppins"
                      >
                        Mostrar últimos movimientos
                      </Checkbox>
                    </VStack>
                  </Box>

                  <Divider />

                  {/* Configuración para Egresos */}
                  <Box w="100%">
                    <Text fontSize="md" fontWeight="500" mb={3} fontFamily="poppins" color="#035187">
                      Egresos
                    </Text>
                    <VStack spacing={2} align="start" pl={4}>
                      <Checkbox
                        isChecked={localConfig.exit.showPhoto}
                        onChange={(e) => handleVisibilityChange('exit', 'showPhoto', e.target.checked)}
                        fontFamily="poppins"
                      >
                        Mostrar foto
                      </Checkbox>
                      <Checkbox
                        isChecked={localConfig.exit.showName}
                        onChange={(e) => handleVisibilityChange('exit', 'showName', e.target.checked)}
                        fontFamily="poppins"
                      >
                        Mostrar Nombre
                      </Checkbox>
                      <Checkbox
                        isChecked={localConfig.exit.showCategory}
                        onChange={(e) => handleVisibilityChange('exit', 'showCategory', e.target.checked)}
                        fontFamily="poppins"
                      >
                        Mostrar categoría
                      </Checkbox>
                      <Checkbox
                        isChecked={localConfig.exit.showLoteUF}
                        onChange={(e) => handleVisibilityChange('exit', 'showLoteUF', e.target.checked)}
                        fontFamily="poppins"
                      >
                        Mostrar Lote UF
                      </Checkbox>
                      <Checkbox
                        isChecked={localConfig.exit.showRecentMovements}
                        onChange={(e) => handleVisibilityChange('exit', 'showRecentMovements', e.target.checked)}
                        fontFamily="poppins"
                      >
                        Mostrar últimos movimientos
                      </Checkbox>
                    </VStack>
                  </Box>
                </VStack>
              </TabPanel>

              {/* Tab de Privacidad de fotos */}
              <TabPanel>
                <VStack spacing={4} align="start">
                  <Text fontSize="lg" fontWeight="500" fontFamily="poppins">
                    Configuración: Ocultar foto de personas específicas
                  </Text>
                  <Text fontSize="sm" color="#536d79" fontFamily="poppins">
                    Para los DNI/documentos que cargues acá, en vez de la foto real se va a mostrar un avatar genérico. El resto de las personas se sigue mostrando normal.
                  </Text>

                  <FormControl>
                    <FormLabel fontFamily="poppins">DNI/documentos (separados por coma):</FormLabel>
                    <Textarea
                      value={localConfig.hiddenPhotoDocuments || ''}
                      onChange={(e) => handleHiddenPhotoDocumentsChange(e.target.value)}
                      placeholder="12345678, 30111222"
                      fontFamily="poppins"
                    />
                  </FormControl>
                </VStack>
              </TabPanel>

              {/* Tab de Equipos Face ID (solo en el front de la ficha) */}
              {hasDeviceSelection && (
                <TabPanel>
                  <VStack spacing={4} align="start">
                    <Text fontSize="lg" fontWeight="500" fontFamily="poppins">
                      Configuración: Equipos Face ID a mostrar
                    </Text>
                    <Text fontSize="sm" color="#536d79" fontFamily="poppins">
                      Elegí uno o más equipos. Si no marcás ninguno, se muestra la información de todos los equipos.
                    </Text>

                    <VStack spacing={2} align="start" pl={2}>
                      {deviceOptions.map((deviceName) => {
                        const selected = localConfig.selectedFaceIdDevices || [];
                        // Lista vacia = se muestran todos los equipos (ver
                        // fichaConfigStorage.js) - los checkboxes se ven
                        // todos tildados para que coincida con lo que
                        // realmente esta pasando en pantalla, en vez de
                        // mostrarse todos destildados y confundir.
                        const isChecked = selected.length === 0 ? true : selected.includes(deviceName);
                        return (
                          <Checkbox
                            key={deviceName}
                            isChecked={isChecked}
                            onChange={(e) => toggleSelectedDevice(deviceName, e.target.checked)}
                            fontFamily="poppins"
                          >
                            {deviceName}
                          </Checkbox>
                        );
                      })}
                    </VStack>
                  </VStack>
                </TabPanel>
              )}
            </TabPanels>
          </Tabs>
        </ModalBody>

        <ModalFooter>
          <HStack spacing={3}>
            <Button
              variant="ghost"
              onClick={handleCancel}
              fontFamily="poppins"
            >
              Cancelar
            </Button>
            <Button
              bg="#035187"
              color="white"
              onClick={handleSave}
              _hover={{ bg: "#024066" }}
              fontFamily="poppins"
            >
              Guardar
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

ConfigurationModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  config: PropTypes.shape({
    displayTime: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    hiddenPhotoDocuments: PropTypes.string,
    entry: PropTypes.shape({
      showPhoto: PropTypes.bool.isRequired,
      showName: PropTypes.bool.isRequired,
      showCategory: PropTypes.bool.isRequired,
      showLoteUF: PropTypes.bool.isRequired,
      showRecentMovements: PropTypes.bool.isRequired,
    }).isRequired,
    exit: PropTypes.shape({
      showPhoto: PropTypes.bool.isRequired,
      showName: PropTypes.bool.isRequired,
      showCategory: PropTypes.bool.isRequired,
      showLoteUF: PropTypes.bool.isRequired,
      showRecentMovements: PropTypes.bool.isRequired,
    }).isRequired,
  }).isRequired,
  onConfigChange: PropTypes.func.isRequired,
  deviceOptions: PropTypes.arrayOf(PropTypes.string),
};

ConfigurationModal.defaultProps = {
  deviceOptions: [],
};

export default ConfigurationModal;