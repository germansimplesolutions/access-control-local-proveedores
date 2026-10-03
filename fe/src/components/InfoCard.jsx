import PropTypes from 'prop-types';
import { Text, Flex, Divider } from "@chakra-ui/react";

const InfoCard = ({ name, batch, dateTime, category_id, config, type }) => {
  const visibilityConfig = type === 'entry' ? config.entry : config.exit;
  return (
    <Flex direction="column" px={2} mb={1}>
      {visibilityConfig.showName && (
        <Text
          fontSize={12}
          color="#536d79"
          fontWeight={500}
        >
          {name}
        </Text>
      )}
      
      {visibilityConfig.showCategory && (
        <Text fontSize={10} color="#536d79" fontWeight={500}>
          {category_id}
        </Text>
      )}
      
      {visibilityConfig.showLoteUF && (
        <Text fontSize={12}>{batch}</Text>
      )}
      
      <Text fontSize={12} mb={1}>
        {dateTime}
      </Text>
      
      <Divider borderColor="#D9D9D9" />
    </Flex>
  );
};

InfoCard.propTypes = {
  name: PropTypes.string.isRequired,
  batch: PropTypes.string.isRequired,
  dateTime: PropTypes.string.isRequired,
  category_id: PropTypes.string.isRequired,
  config: PropTypes.shape({
    entry: PropTypes.object.isRequired,
    exit: PropTypes.object.isRequired,
  }).isRequired,
  type: PropTypes.oneOf(['entry', 'exit']).isRequired,
};

export default InfoCard;
