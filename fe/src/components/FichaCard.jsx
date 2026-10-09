import PropTypes from 'prop-types';
import { Box, Text, Flex, Badge, VStack, Divider, Grid, Table, Thead, Tbody, Tr, Th, Td } from '@chakra-ui/react';

// Etiquetas en español para el "type" que manda la plataforma central
// (Resident/Permanent/Temporal, con esa capitalización) en cada
// autorización.
const TYPE_LABELS = {
  resident: 'Residente',
  permanent: 'Permanente',
  temporal: 'Temporal',
};

const typeLabel = (type) => TYPE_LABELS[(type || '').toLowerCase()] || type || '—';

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

  const { person, expirationDetails, authorizations, hasExpired } = ficha;
  const individual = person.individual || {};
  const car = Array.isArray(individual.cars) ? individual.cars[0] : null;

  // "Categoría - Empresa" debajo del nombre - individual.category_id es el
  // mismo dato para cualquiera de las autorizaciones de la persona (no
  // depende de a que lote puntual se esta mostrando acá), así que no hace
  // falta elegir entre varias.
  const headerSubtitle = [individual.category_id, individual.company].filter(Boolean).join(' - ');

  return (
    <Box bg="white" borderRadius={12} p={6} boxShadow="md" border={hasExpired ? '3px solid #E53E3E' : '1px solid #E2E8F0'}>
      {hasExpired && (
        <Box bg="#E53E3E" color="white" borderRadius={8} p={2} mb={4} textAlign="center">
          <Text fontWeight={700} fontFamily="poppins">⚠ Tiene documentación o autorización vencida</Text>
        </Box>
      )}

      <Flex gap={4} alignItems="flex-start" mb={4}>
        <Box
          w="100px"
          h="100px"
          borderRadius={10}
          bg="#035187"
          color="white"
          fontSize={28}
          fontWeight={700}
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
          fontFamily="poppins"
        >
          {(individual.name || '?').charAt(0)}{(individual.lastname || '').charAt(0)}
        </Box>
        <Box>
          <Text fontSize={22} fontWeight={600} fontFamily="poppins">
            {individual.name} {individual.lastname}
          </Text>
          {headerSubtitle && (
            <Text fontSize={14} color="#536d79" fontFamily="poppins">
              {headerSubtitle}
            </Text>
          )}
        </Box>
      </Flex>

      {car && (
        <>
          <Divider mb={4} />
          <Grid templateColumns="1fr 1fr" gap={4} mb={4}>
            <Field label="Vehículo" value={car.brand} />
            <Field label="Patente" value={car.plate} />
          </Grid>
        </>
      )}

      <Divider mb={2} />

      <Text fontSize={14} fontWeight={600} mb={2} fontFamily="poppins">
        Vencimientos
      </Text>
      <VStack spacing={0} align="stretch">
        {expirationDetails.map((item) => (
          <ExpirationRow key={item.label} label={item.label} date={item.date} expired={item.expired} />
        ))}
      </VStack>

      <Divider my={4} />

      <Text fontSize={14} fontWeight={600} mb={2} fontFamily="poppins">
        Autorizaciones de Ingreso
      </Text>
      {(!authorizations || authorizations.length === 0) ? (
        <Text fontSize={13} color="#536d79" fontFamily="poppins">Sin autorizaciones registradas.</Text>
      ) : (
        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th pl={0} fontFamily="poppins">Lote</Th>
              <Th fontFamily="poppins">UF</Th>
              <Th fontFamily="poppins">Tipo</Th>
              <Th fontFamily="poppins">Categoría</Th>
              <Th pr={0} textAlign="right" fontFamily="poppins">Autorizado Hasta</Th>
            </Tr>
          </Thead>
          <Tbody>
            {authorizations.map((auth) => (
              <Tr key={auth.id}>
                <Td pl={0} fontFamily="poppins" fontSize={13}>{auth.uf}</Td>
                <Td fontFamily="poppins" fontSize={13}>{auth.uf}</Td>
                <Td fontFamily="poppins" fontSize={13}>{typeLabel(auth.type)}</Td>
                <Td fontFamily="poppins" fontSize={13}>{auth.category}</Td>
                <Td pr={0} textAlign="right">
                  <Flex justifyContent="flex-end" alignItems="center" gap={2}>
                    <Text fontSize={12} color="#536d79" fontFamily="poppins">
                      {auth.authDateTo || 'Sin vencimiento'}
                    </Text>
                    <Badge colorScheme={auth.expired ? 'red' : 'green'}>
                      {auth.expired ? 'Vencido' : 'Vigente'}
                    </Badge>
                  </Flex>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Box>
  );
};

FichaCard.propTypes = {
  ficha: PropTypes.shape({
    found: PropTypes.bool,
    person: PropTypes.object,
    expirationDetails: PropTypes.array,
    authorizations: PropTypes.array,
    hasExpired: PropTypes.bool,
  }),
};

export default FichaCard;
