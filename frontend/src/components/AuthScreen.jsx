import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import {
  Box,
  Button,
  Container,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Text,
  VStack,
  useColorMode,
  useColorModeValue,
  IconButton,
  Divider,
  HStack,
  Icon,
} from "@chakra-ui/react";
import { FaMoon, FaSun, FaArrowRight, FaUserSecret } from "react-icons/fa";

export default function AuthScreen() {
  const { login } = useAuth();
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { colorMode, toggleColorMode } = useColorMode();

  const bg = useColorModeValue("white", "gray.800");
  const fg = useColorModeValue("gray.800", "white");
  const border = useColorModeValue("gray.200", "gray.700");
  const green = useColorModeValue("brand.500", "brand.400");
  const muted = useColorModeValue("gray.500", "gray.400");

  async function handleSubmit() {
    if (tab === "register") {
      if (!username.trim() || !password.trim()) {
        setErr("Username and password are required");
        return;
      }
    } else {
      if (!username.trim() && !email.trim()) {
        setErr("Username or email is required");
        return;
      }
    }
    setErr("");
    setLoading(true);
    try {
      const resp =
        tab === "login"
          ? await api.login(username, email, password || undefined)
          : await api.register(username, email, password);
      login(resp);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAnon() {
    setErr("");
    setLoading(true);
    try {
      const resp = await api.anonymous();
      login(resp);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter") handleSubmit();
  }

  return (
    <Box
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg={useColorModeValue("gray.50", "gray.900")}
      p={4}
    >
      <IconButton
        position="fixed"
        top={4}
        right={4}
        icon={colorMode === "light" ? <FaMoon /> : <FaSun />}
        onClick={toggleColorMode}
        variant="ghost"
        aria-label="Toggle Color Mode"
      />
      <Container
        maxW="md"
        bg={bg}
        p={8}
        borderRadius="xl"
        boxShadow="2xl"
        borderWidth="1px"
        borderColor={border}
      >
        <VStack spacing={8} align="stretch">
          <Box textAlign="center">
            <Text
              fontSize="xs"
              letterSpacing="widest"
              color={green}
              textTransform="uppercase"
              mb={2}
              fontWeight="bold"
            >
              Relay
            </Text>
            <Heading
              size="xl"
              fontWeight="800"
              letterSpacing="tight"
              mb={2}
              color={fg}
            >
              Real
              <Text as="span" color={green}>
                -
              </Text>
              time
              <br />
              group chat.
            </Heading>
            <Text fontSize="sm" color={muted} fontWeight="medium">
              Open rooms. Instant messages.
            </Text>
          </Box>

          <Flex borderBottom="1px" borderColor={border}>
            {["login", "register"].map((t) => (
              <Button
                key={t}
                flex={1}
                variant="ghost"
                borderRadius="0"
                borderBottom="2px solid"
                borderColor={tab === t ? green : "transparent"}
                color={tab === t ? green : muted}
                onClick={() => {
                  setTab(t);
                  setErr("");
                }}
                textTransform="uppercase"
                fontSize="xs"
                letterSpacing="wider"
                _hover={{ bg: "transparent", color: green }}
              >
                {t}
              </Button>
            ))}
          </Flex>

          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel fontSize="sm" color={muted}>
                Username
              </FormLabel>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={onKey}
                placeholder="your_username"
                size="md"
                variant="filled"
                bg={useColorModeValue("gray.100", "gray.700")}
                _hover={{ bg: useColorModeValue("gray.200", "gray.600") }}
                _focus={{
                  bg: useColorModeValue("white", "gray.800"),
                  borderColor: green,
                }}
                autoFocus
              />
            </FormControl>

            {(tab === "register" || tab === "login") && (
              <FormControl>
                <FormLabel fontSize="sm" color={muted}>
                  Email
                </FormLabel>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="your@email.com"
                  type="email"
                  size="md"
                  variant="filled"
                  bg={useColorModeValue("gray.100", "gray.700")}
                  _hover={{ bg: useColorModeValue("gray.200", "gray.600") }}
                  _focus={{
                    bg: useColorModeValue("white", "gray.800"),
                    borderColor: green,
                  }}
                />
              </FormControl>
            )}

            <FormControl>
              <FormLabel fontSize="sm" color={muted}>
                Password{" "}
                {tab === "login" && (
                  <Text
                    as="span"
                    fontSize="xs"
                    opacity={0.7}
                    fontWeight="normal"
                  >
                    (required)
                  </Text>
                )}
              </FormLabel>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onKey}
                placeholder={
                  tab === "login" ? "or join anonymously" : "required"
                }
                type="password"
                size="md"
                variant="filled"
                bg={useColorModeValue("gray.100", "gray.700")}
                _hover={{ bg: useColorModeValue("gray.200", "gray.600") }}
                _focus={{
                  bg: useColorModeValue("white", "gray.800"),
                  borderColor: green,
                }}
              />
            </FormControl>

            {err && (
              <Text color="red.500" fontSize="sm" textAlign="center">
                {err}
              </Text>
            )}

            <Button
              size="lg"
              colorScheme="brand"
              onClick={handleSubmit}
              isLoading={loading}
              isDisabled={
                (!username.trim() && !email.trim()) ||
                (tab === "register" && (!password.trim() || !username.trim()))
              }
              rightIcon={<FaArrowRight />}
              mt={4}
            >
              {tab === "login" ? "Sign in" : "Create account"}
            </Button>
          </VStack>

          <HStack spacing={4}>
            <Divider />
            <Text
              fontSize="xs"
              color={muted}
              textTransform="uppercase"
              letterSpacing="widest"
            >
              or
            </Text>
            <Divider />
          </HStack>

          <Box>
            <Button
              w="full"
              variant="outline"
              onClick={handleAnon}
              isLoading={loading}
              leftIcon={<FaUserSecret />}
              colorScheme="gray"
            >
              Continue anonymously
            </Button>
            <Text fontSize="xs" color={muted} mt={3} textAlign="center">
              No account saved — session only
            </Text>
          </Box>
        </VStack>
      </Container>
    </Box>
  );
}
