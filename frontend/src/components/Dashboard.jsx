import { useState, useEffect } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Input,
  Text,
  VStack,
  HStack,
  useColorModeValue,
  Spinner,
  IconButton,
  Badge,
  useToast,
  Icon,
} from "@chakra-ui/react";
import { FaSignOutAlt, FaPlus, FaArrowRight, FaTrash } from "react-icons/fa";

export default function Dashboard({ onEnterRoom }) {
  const { session, logout } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roomInput, setRoomInput] = useState("");
  const [joining, setJoining] = useState(false);
  const toast = useToast();

  const bg = useColorModeValue("gray.50", "gray.900");
  const headerBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const cardBg = useColorModeValue("white", "gray.800");
  const cardHoverBg = useColorModeValue("gray.50", "gray.700");
  const green = useColorModeValue("brand.500", "brand.400");
  const muted = useColorModeValue("gray.500", "gray.400");
  const fg = useColorModeValue("gray.800", "gray.100");

  useEffect(() => {
    // Auto-join from URL param
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) {
      handleJoin(room);
      window.history.replaceState({}, "", window.location.pathname);
    }
    loadRooms();
  }, []);

  async function loadRooms() {
    setLoading(true);
    try {
      const data = await api.myRooms();
      setRooms(data);
    } catch {}
    setLoading(false);
  }

  async function handleJoin(slug) {
    const s = (slug || roomInput).trim();
    if (!s) {
      toast({
        title: "Enter a room name",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    setJoining(true);
    try {
      const parsed = parseSlug(s);
      await api.joinRoom(parsed);
      onEnterRoom(parsed);
    } catch (e) {
      toast({
        title: "Error joining room",
        description: e.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setJoining(false);
    }
  }

  function parseSlug(val) {
    try {
      const url = new URL(val);
      return url.searchParams.get("room") || val;
    } catch {
      return val;
    }
  }

  function genSlug() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  async function createNew() {
    const slug = genSlug();
    setJoining(true);
    try {
      await api.joinRoom(slug);
      onEnterRoom(slug);
    } catch (e) {
      toast({
        title: "Error creating room",
        description: e.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave(e, slug) {
    e.stopPropagation();
    if (!window.confirm(`Leave #${slug}?`)) return;
    try {
      await api.leaveRoom(slug);
      loadRooms();
      toast({ title: `Left #${slug}`, status: "info", duration: 2000 });
    } catch (e) {
      toast({
        title: "Error leaving room",
        description: e.message,
        status: "error",
        duration: 3000,
      });
    }
  }

  return (
    <Box minH="100vh" bg={bg} display="flex" flexDirection="column">
      {/* Header */}
      <Flex
        align="center"
        justify="space-between"
        px={6}
        py={3}
        bg={headerBg}
        borderBottom="1px solid"
        borderColor={border}
        boxShadow="sm"
      >
        <Text
          fontSize="lg"
          fontWeight="800"
          color={green}
          letterSpacing="wider"
        >
          RELAY
        </Text>
        <HStack spacing={4}>
          <Text fontSize="sm" color={muted}>
            signed in as{" "}
            <Text
              as="span"
              fontWeight="bold"
              color={session?.isAnonymous ? "yellow.500" : green}
            >
              {session?.username}
            </Text>
            {session?.isAnonymous && " (anon)"}
          </Text>
          <Button
            size="sm"
            variant="ghost"
            colorScheme="red"
            rightIcon={<FaSignOutAlt />}
            onClick={logout}
          >
            Sign out
          </Button>
        </HStack>
      </Flex>

      <Container maxW="3xl" py={12} flex={1}>
        {/* Create / join */}
        <Box mb={12}>
          <Text
            fontSize="sm"
            fontWeight="bold"
            color={muted}
            textTransform="uppercase"
            letterSpacing="widest"
            mb={4}
          >
            Enter a room
          </Text>
          <Flex gap={4}>
            <Input
              flex={1}
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="Room name or invite link"
              size="lg"
              variant="filled"
              bg={useColorModeValue("white", "gray.800")}
              _hover={{ bg: useColorModeValue("gray.50", "gray.700") }}
              _focus={{
                bg: useColorModeValue("white", "gray.800"),
                borderColor: green,
              }}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            <Button
              size="lg"
              colorScheme="brand"
              onClick={() => handleJoin()}
              isLoading={joining}
              isDisabled={!roomInput.trim()}
              px={8}
            >
              Join
            </Button>
            <Button
              size="lg"
              variant="outline"
              colorScheme="brand"
              onClick={createNew}
              isLoading={joining}
              leftIcon={<FaPlus />}
              px={6}
            >
              New
            </Button>
          </Flex>
        </Box>

        {/* My rooms */}
        <Box>
          <Text
            fontSize="sm"
            fontWeight="bold"
            color={muted}
            textTransform="uppercase"
            letterSpacing="widest"
            mb={4}
          >
            Your rooms
          </Text>

          {loading ? (
            <Flex justify="center" p={12}>
              <Spinner size="xl" color={green} thickness="4px" speed="0.65s" />
            </Flex>
          ) : rooms.length === 0 ? (
            <Text
              fontSize="md"
              color={muted}
              fontStyle="italic"
              py={8}
              textAlign="center"
            >
              No rooms yet — create one or join with a link.
            </Text>
          ) : (
            <VStack spacing={3} align="stretch">
              {rooms.map((r) => (
                <Flex
                  key={r.id}
                  onClick={() => onEnterRoom(r.slug)}
                  p={4}
                  bg={cardBg}
                  border="1px solid"
                  borderColor={border}
                  borderRadius="lg"
                  cursor="pointer"
                  transition="all 0.2s"
                  _hover={{
                    bg: cardHoverBg,
                    borderColor: green,
                    transform: "translateY(-2px)",
                    shadow: "md",
                  }}
                  align="center"
                  justify="space-between"
                  group="true" // Chakra 2 has different group hovering, so we use simpler _hover
                >
                  <Box flex={1}>
                    <Heading
                      size="md"
                      mb={1}
                      transition="color 0.2s"
                      _hover={{ color: green }}
                    >
                      #{r.slug}
                    </Heading>
                    <Text fontSize="sm" color={muted} noOfLines={1}>
                      {r.last_message_content ? (
                        <>
                          <Text as="span" fontWeight="600" color={fg}>
                            {r.last_message_content}
                          </Text>
                          <Text as="span" mx={1}>
                            •
                          </Text>
                          {new Date(r.last_message_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </>
                      ) : (
                        "No messages yet"
                      )}
                    </Text>
                  </Box>
                  <HStack spacing={4}>
                    <Badge
                      colorScheme={r.member_count > 1 ? "brand" : "gray"}
                      px={2}
                      py={0.5}
                      borderRadius="md"
                      letterSpacing="wide"
                    >
                      {r.member_count} member{r.member_count !== 1 ? "s" : ""}
                    </Badge>
                    <IconButton
                      icon={<FaTrash />}
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      onClick={(e) => handleLeave(e, r.slug)}
                      aria-label="Leave Room"
                      _hover={{ bg: "red.50", color: "red.500" }}
                    />
                    <Icon
                      as={FaArrowRight}
                      color={muted}
                      transition="all 0.2s"
                      boxSize={3}
                    />
                  </HStack>
                </Flex>
              ))}
            </VStack>
          )}
        </Box>
      </Container>
    </Box>
  );
}
