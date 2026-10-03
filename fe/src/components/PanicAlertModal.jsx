import PropTypes from 'prop-types';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Text,
  Box,
  Flex,
  Image,
} from '@chakra-ui/react';

const PanicAlertModal = ({ isOpen, onClose, data }) => {
  const { name, UF, lote, picture, category_id, deviceName, fecha, hora } =
    data;

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size='2xl'>
      <ModalOverlay />
      <ModalContent borderRadius='md' overflow='hidden'>
        <ModalHeader
          bg='red.600'
          color='white'
          textAlign='center'
          py={4}
          fontSize='2xl'
        >
          Alerta - Pánico
        </ModalHeader>

        <ModalBody bg='white' p={4}>
          <Box p={4}>
            <Flex
              direction={{ base: 'column', sm: 'row' }}
              justifyContent='space-between'
              alignItems='flex-start'
              mx={4}
            >
              <Box>
                <Image
                  src={`data:image/png;base64,${picture}`}
                  alt={name}
                  borderRadius='md'
                  boxSize='190px'
                  objectFit='cover'
                />
              </Box>
              <Box textAlign='left' ml={{ base: 0, sm: 16 }} gap={6}>
                <Text fontSize='xl' mb={6}>
                  {`${fecha}, ${hora}`}
                </Text>
                <Text fontSize='xl' mb={6}>
                  {`${name} - ${category_id}`}
                </Text>
                <Text fontSize='xl' mb={6}>
                  {`Lote ${lote}, UF ${UF}`}
                </Text>
                <Text fontSize='xl' mb={6}>
                  {`Acceso: ${deviceName}`}
                </Text>
              </Box>
            </Flex>
          </Box>
        </ModalBody>

        <ModalFooter justifyContent='center' pb={8} pt={4}>
          <Button
            onClick={onClose}
            bg='red.600'
            color='white'
            size='lg'
            px={10}
            borderRadius='md'
            _hover={{ bg: 'red.700' }}
          >
            Cerrar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// Definición de PropTypes
PanicAlertModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  data: PropTypes.shape({
    name: PropTypes.string.isRequired,
    UF: PropTypes.number.isRequired,
    lote: PropTypes.number.isRequired,
    category_id: PropTypes.string.isRequired,
    deviceName: PropTypes.string.isRequired,
    picture: PropTypes.string.isRequired,
    fecha: PropTypes.string.isRequired,
    hora: PropTypes.string.isRequired,
  }),
};

export default PanicAlertModal;
