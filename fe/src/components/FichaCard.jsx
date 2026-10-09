import PropTypes from 'prop-types';
import { Box, Text, Flex, Badge, VStack, Divider, Grid, Table, Thead, Tbody, Tr, Th, Td, Image } from '@chakra-ui/react';

// Etiquetas en español para el "type" que manda la plataforma central
// (Resident/Permanent/Temporal, con esa capitalización) en cada
// autorización.
const TYPE_LABELS = {
  resident: 'Residente',
  permanent: 'Permanente',
  temporal: 'Temporal',
};

const typeLabel = (type) => TYPE_LABELS[(type || '').toLowerCase()] || type || '—';

// El backend manda las fechas en formato ISO (YYYY-MM-DD, como vienen de la
// plataforma central). Acá se muestran como DD/MM/AAAA.
const formatDate = (dateStr) => {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
};

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
  <Flex justifyContent="space-between" alignItems="center" py={2}>
    <Text fontSize={15} fontFamily="poppins">{label}</Text>
    <Flex alignItems="center" gap={3} flexShrink={0} whiteSpace="nowrap">
      <Text fontSize={14} color="#536d79" fontFamily="poppins" whiteSpace="nowrap">
        {formatDate(date) || 'Sin dato'}
      </Text>
      <Badge colorScheme={expired ? 'red' : date ? 'green' : 'gray'} fontSize={12} px={2} py={1}>
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

const FichaCard = ({ ficha, photo }) => {
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
    <Box bg="white" borderRadius={16} p={8} boxShadow="lg" border={hasExpired ? '3px solid #E53E3E' : '1px solid #E2E8F0'}>
      <Flex gap={5} alignItems="flex-start" mb={5}>
        {photo ? (
          // Foto de la persona identificada (viene en el propio evento
          // accessControlEvent - la misma que el equipo o la carpeta local
          // le dieron al backend segun PHOTO_SOURCE, ver faceIDController.js).
          // Si no hay foto (persona sin foto en el equipo o sin foto
          // sincronizada), se muestra el cuadro de iniciales igual - la
          // ficha siempre se tiene que mostrar, tenga o no foto.
          <Image
            src={`data:image/jpeg;base64,${photo}`}
            alt={`${individual.name || ''} ${individual.lastname || ''}`}
            w="130px"
            h="130px"
            borderRadius={12}
            objectFit="cover"
            flexShrink={0}
          />
        ) : (
          <Box
            w="130px"
            h="130px"
            borderRadius={12}
            bg="#035187"
            color="white"
            fontSize={36}
            fontWeight={700}
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
            fontFamily="poppins"
          >
            {(individual.name || '?').charAt(0)}{(individual.lastname || '').charAt(0)}
          </Box>
        )}
        <Box>
          <Text fontSize={28} fontWeight={600} fontFamily="poppins">
            {individual.name} {individual.lastname}
          </Text>
          {individual.document && (
            <Text fontSize={15} color="#536d79" fontFamily="poppins">
              DNI {individual.document}
            </Text>
          )}
          {headerSubtitle && (
            <Text fontSize={17} color="#536d79" fontFamily="poppins">
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

      <Text fontSize={16} fontWeight={600} mb={2} fontFamily="poppins">
        Vencimientos
      </Text>
      <VStack spacing={0} align="stretch">
        {expirationDetails.map((item) => (
          <ExpirationRow key={item.label} label={item.label} date={item.date} expired={item.expired} />
        ))}
      </VStack>

      <Divider my={4} />

      <Text fontSize={16} fontWeight={600} mb={2} fontFamily="poppins">
        Autorizaciones de Ingreso
      </Text>
      {(!authorizations || authorizations.length === 0) ? (
        <Text fontSize={14} color="#536d79" fontFamily="poppins">Sin autorizaciones registradas.</Text>
      ) : (
        <Box overflowX="auto">
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th pl={0} fontFamily="poppins" fontSize={12}>Lote</Th>
                <Th fontFamily="poppins" fontSize={12}>UF</Th>
                <Th fontFamily="poppins" fontSize={12}>Tipo</Th>
                <Th fontFamily="poppins" fontSize={12}>Categoría</Th>
                <Th pr={0} textAlign="right" fontFamily="poppins" fontSize={12} whiteSpace="nowrap">Autorizado Hasta</Th>
              </Tr>
            </Thead>
            <Tbody>
              {authorizations.map((auth) => (
                <Tr key={auth.id}>
                  <Td pl={0} fontFamily="poppins" fontSize={14}>{auth.uf}</Td>
                  <Td fontFamily="poppins" fontSize={14}>{auth.uf}</Td>
                  <Td fontFamily="poppins" fontSize={14}>{typeLabel(auth.type)}</Td>
                  <Td fontFamily="poppins" fontSize={14}>{auth.category}</Td>
                  <Td pr={0} textAlign="right">
                    <Flex justifyContent="flex-end" alignItems="center" gap={2} whiteSpace="nowrap">
                      <Text fontSize={13} color="#536d79" fontFamily="poppins" whiteSpace="nowrap">
                        {formatDate(auth.authDateTo) || 'Sin vencimiento'}
                      </Text>
                      <Badge colorScheme={auth.expired ? 'red' : 'green'} fontSize={12} px={2} py={1} flexShrink={0}>
                        {auth.expired ? 'Vencido' : 'Vigente'}
                      </Badge>
                    </Flex>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      {hasExpired ? (
        <Box mt={5} bg="#E53E3E" color="white" borderRadius={10} p={3} textAlign="center">
          <Text fontWeight={700} fontSize={18} fontFamily="poppins">⚠ Tiene documentación o autorización vencida</Text>
        </Box>
      ) : (
        <Box mt={5} bg="#16A34A" color="white" borderRadius={10} p={3} textAlign="center">
          <Text fontWeight={700} fontSize={18} fontFamily="poppins">✓ INGRESO OK</Text>
        </Box>
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
  photo: PropTypes.string,
};

export default FichaCard;
