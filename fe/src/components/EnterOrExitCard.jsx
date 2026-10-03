import PropTypes from 'prop-types';
import { Text, Image, Avatar, Flex } from '@chakra-ui/react';

// Convierte el string "12345678, 30111222" (guardado en config) en un array
// de DNIs limpios, ignorando espacios y entradas vacías.
const parseHiddenPhotoDocuments = (value) => {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter((v) => v !== '');
};

const EnterOrExitCard = ({ event, config, type }) => {
  const { name, UF, lote, picture, category_id, id } = event;
  const visibilityConfig = type === 'entry' ? config.entry : config.exit;

  // "id" es el DNI/documento de la persona (así lo arma el backend en
  // AccessControlEvent). Si está en la lista configurada, se muestra un
  // avatar genérico en vez de la foto real.
  const hiddenPhotoDocuments = parseHiddenPhotoDocuments(config.hiddenPhotoDocuments);
  const isPhotoHidden = id !== undefined && id !== null && hiddenPhotoDocuments.includes(id.toString());

  return (
    <Flex direction='column' px={2}>
      {visibilityConfig.showPhoto && (
        isPhotoHidden ? (
          <Avatar
            name=''
            src=''
            mt={4}
            mb={2}
            boxSize='450px'
          />
        ) : (
          <Image
            src={`data:image/png;base64,${picture}`}
            alt='Face-id img'
            mt={4}
            mb={2}
            boxSize='450px'
            objectFit='cover'
            h='auto'
          />
        )
      )}
      
      {visibilityConfig.showName && (
        <Text
          fontSize={{
            xl: '24px',
            '2xl': '35px',
          }}
          fontWeight={600}
          color='#536d79'
        >
          {name}
        </Text>
      )}
      
      {(visibilityConfig.showCategory || visibilityConfig.showLoteUF) && (
        <Text
          fontWeight={300}
          fontSize={{
            xl: '20px',
            '2xl': '24px',
          }}
        >
          {[
            visibilityConfig.showCategory ? category_id : null,
            visibilityConfig.showLoteUF ? `Lote ${lote} - UF ${UF}` : null
          ].filter(Boolean).join(', ')}
        </Text>
      )}
    </Flex>
  );
};

EnterOrExitCard.propTypes = {
  event: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string.isRequired,
    UF: PropTypes.number.isRequired,
    lote: PropTypes.number.isRequired,
    category_id: PropTypes.string.isRequired,
    picture: PropTypes.string.isRequired,
  }).isRequired,
  config: PropTypes.shape({
    entry: PropTypes.object.isRequired,
    exit: PropTypes.object.isRequired,
    hiddenPhotoDocuments: PropTypes.string,
  }).isRequired,
  type: PropTypes.oneOf(['entry', 'exit']).isRequired,
};

export default EnterOrExitCard;
