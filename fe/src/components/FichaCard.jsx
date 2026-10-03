import PropTypes from 'prop-types';
import { Box, Text, Flex, Badge, VStack, Divider, Grid } from '@chakra-ui/react';

// Muestra un dato de la ficha (label + valor), ocultando la fila si el
// valor viene vacío.
const Field = ({ label, value }) => {
  if (!value) return null;
  return (
    <Box>
      <Text fontSize={11} color="#536d79" fontFamily="poppins">{label}</Text>
      <Text fontSize={14} fontFamily="poppins">{value}</Text>
    </Box>
  );
};

Field.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

// Una fila de vencimiento, con color segun este vigente o vencido.
const ExpirationRow = ({ label, date, expired }) => (
  <Flex justifyContent="space-between" alignItems="center" py={1}>
    <Text fontSize={13} fontFamily="poppins">{label}</Text>
    <Flex alignItems="center" gap={2}>
      <Text fontSize={12} color="#536d79" fontFamily="poppins">
        {date || 'Sin dato'}
      </Text>
      <Badge colorScheme={expired ? 'red' : date ? 'green' : 'gray'}>
        {expired ? 'Vencido' : date ? 'Vigente' : 'Sin dato'}
      </Badge>
    </Flex>
  </Flex>
);

ExpirationRow.propTypes = {
  label: PropTypes.string.isRequired,
  date: PropTypes.string,
  expired: PropTypes.bool.isRequired,
};

const FichaCard = ({ ficha }) => {
  if (!ficha || !ficha.found) {
    return (
      <Box bg="white" borderRadius={12} p={6} boxShadow="md">
        <Text fontFamily="poppins" color="#536d79">
          No hay datos locales guardados para esta persona todavía. Se cargan la próxima vez que sincronice la plataforma central.
        </Text>
      </Box>
    );
  }

  const { person, expirationDetails, hasExpired } = ficha;
  const individual = person.individual || {};
  const car = Array.isArray(individual.cars) ? individual.cars[0] : null;

  return (
    <Box bg="white" borderRadius={12} p={6} boxShadow="md" border={hasExpired ? '3px solid #E53E3E' : '1px solid #E2E8F0'}>
      {hasExpired && (
        <Box bg="#E53E3E" color="white" borderRadius={8} p={2} mb={4} textAlign="center">
          <Text fontWeight={700} fontFamily="poppins">⚠ Tiene documentación vencida</Text>
        </Box>
      )}

      <Flex justifyContent="space-between" alignItems="flex-start" mb={4}>
        <Box>
          <Text fontSize={22} fontWeight={600} fontFamily="poppins">
            {individual.name} {individual.lastname}
          </Text>
          <Text fontSize={14} color="#536d79" fontFamily="poppins">
            DNI {individual.document} · {person.category}
          </Text>
        </Box>
        <Box textAlign="right">
          <Text fontSize={13} color="#536d79" fontFamily="poppins">Lote {person.uf}</Text>
        </Box>
      </Flex>

      <Divider mb={4} />

      <Grid templateColumns="1fr 1fr" gap={4} mb={4}>
        <Field label="Empresa" value={individual.company} />
        <Field label="ART" value={individual.art_company} />
        {car && (
          <>
            <Field label="Vehículo" value={car.brand} />
            <Field label="Patente" value={car.plate} />
          </>
        )}
      </Grid>

      <Divider mb={2} />

      <Text fontSize={14} fontWeight={600} mb={2} fontFamily="poppins">
        Vencimientos
      </Text>
      <VStack spacing={0} align="stretch">
        {expirationDetails.map((item) => (
          <ExpirationRow key={item.label} label={item.label} date={item.date} expired={item.expired} />
        ))}
      </VStack>
    </Box>
  );
};

FichaCard.propTypes = {
  ficha: PropTypes.shape({
    found: PropTypes.bool,
    person: PropTypes.object,
    expirationDetails: PropTypes.array,
    hasExpired: PropTypes.bool,
  }),
};

export default FichaCard;
