import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { useWebSocket } from '../useWebSocket'
import Message from './Message'
import InviteModal from './InviteModal'
import { 
  Box, Flex, Text, IconButton, Textarea, Tooltip, 
  useColorModeValue, Spinner, Badge, HStack, Button, useToast
} from '@chakra-ui/react'
import { keyframes } from '@emotion/react'
import { FaArrowLeft, FaLink, FaPaperclip, FaPaperPlane } from 'react-icons/fa'

const pulseAnimation = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`

export default function Chat({ slug, onBack }) {
  const toast = useToast()
  const { session } = useAuth()
  const [messages, setMessages] = useState([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [errorBar, setErrorBar] = useState(false)
  const endRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  const headerBg = useColorModeValue('white', 'gray.800')
  const border = useColorModeValue('gray.200', 'gray.700')
  const bg = useColorModeValue('gray.50', 'gray.900')
  const green = useColorModeValue('brand.500', 'brand.400')
  const inputBg = useColorModeValue('white', 'gray.900')

  // Load message history
  useEffect(() => {
    api.messages(slug, 80).then(history => {
      setMessages(history)
      setHistoryLoaded(true)
    }).catch(() => setHistoryLoaded(true))
  }, [slug])

  // Scroll to bottom after history loads
  useEffect(() => {
    if (historyLoaded) {
      endRef.current?.scrollIntoView()
    }
  }, [historyLoaded])

  const onMessage = useCallback((data) => {
    setMessages(prev => {
      if (data.id && prev.some(m => m.id === data.id)) return prev
      return [...prev, data]
    })
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  const { send, connected } = useWebSocket({ slug, onMessage })

  useEffect(() => { setErrorBar(!connected) }, [connected])

  function handleSend() {
    const text = inputVal.trim()
    if (!text || !connected) return
    send({ content: text })
    setInputVal('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function autoResize(e) {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  async function uploadFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (toast) toast({ title: 'Uploading…', status: 'info', duration: 2000 })
    try {
      await api.uploadFile(slug, file)
      if (toast) toast({ title: 'File shared!', status: 'success', duration: 3000 })
    } catch { 
      if (toast) toast({ title: 'Upload failed.', status: 'error', duration: 3000 }) 
    }
    e.target.value = ''
  }

  return (
    <Flex direction="column" h="100vh" bg={bg}>
      {/* Header */}
      <Flex 
        align="center" 
        justify="space-between" 
        px={5} 
        h="52px" 
        borderBottom="1px solid" 
        borderColor={border}
        bg={headerBg}
        flexShrink={0}
      >
        <Flex align="center" gap={4}>
          <Tooltip label="Back to Dashboard">
            <IconButton 
              icon={<FaArrowLeft />} 
              size="sm" 
              variant="ghost" 
              onClick={onBack} 
              aria-label="Back"
            />
          </Tooltip>
          <Text fontSize="sm" fontWeight="bold" color={green} letterSpacing="wider">RELAY</Text>
          <HStack spacing={2}>
            <Box 
              w="8px" 
              h="8px" 
              borderRadius="full" 
              bg={connected ? green : 'gray.400'}
              boxShadow={connected ? `0 0 8px ${green}` : 'none'}
              animation={connected ? `${pulseAnimation} 2s infinite` : 'none'}
            />
            <Badge colorScheme="gray" variant="subtle" fontSize="xs">#{slug}</Badge>
          </HStack>
        </Flex>
        <Button 
          size="sm" 
          leftIcon={<FaLink />} 
          variant="outline" 
          colorScheme="brand" 
          onClick={() => setInviteOpen(true)}
        >
          Invite
        </Button>
      </Flex>

      {/* Error bar */}
      {errorBar && !historyLoaded && (
        <Box bg="red.100" color="red.700" px={5} py={2} fontSize="xs" borderBottom="1px solid" borderColor="red.300">
          Connecting…
        </Box>
      )}
      {errorBar && historyLoaded && (
        <Box bg="red.100" color="red.700" px={5} py={2} fontSize="xs" borderBottom="1px solid" borderColor="red.300">
          Connection lost. Reconnecting…
        </Box>
      )}

      {/* Messages */}
      <Flex flex={1} overflowY="auto" p={5} direction="column" gap={1}>
        {!historyLoaded && (
          <Flex justify="center" p={10}>
            <Spinner color={green} size="lg" />
          </Flex>
        )}
        {historyLoaded && messages.length === 0 && (
          <Text fontSize="xs" color="gray.500" fontStyle="italic" textAlign="center" py={10}>
            No messages yet. Say hello!
          </Text>
        )}
        {messages.map((msg, i) => (
          <Message key={msg.id || i} data={msg} isOwn={msg.username === session?.username} />
        ))}
        <div ref={endRef} />
      </Flex>

      {/* Input */}
      <Flex 
        p={4} 
        borderTop="1px solid" 
        borderColor={border} 
        bg={headerBg} 
        gap={3} 
        align="flex-end"
      >
        <Text fontSize="xs" color={green} pb="10px" whiteSpace="nowrap" flexShrink={0} fontWeight="bold">
          {session?.username}
        </Text>
        <Textarea
          ref={textareaRef}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKey}
          onInput={autoResize}
          rows={1}
          placeholder="Message…"
          bg={inputBg}
          border="1px solid"
          borderColor={border}
          fontFamily="body"
          fontSize="sm"
          p={2.5}
          px={3}
          resize="none"
          minH="40px"
          maxH="120px"
          _focus={{ borderColor: green, boxShadow: 'none' }}
          _hover={{ borderColor: useColorModeValue('gray.300', 'gray.600') }}
          flex={1}
        />
        <Tooltip label="Upload file">
          <IconButton 
            as="label" 
            cursor="pointer"
            icon={<FaPaperclip />} 
            size="md" 
            variant="outline" 
            colorScheme="gray"
            aria-label="Upload File"
            _hover={{ color: green, borderColor: green }}
          >
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={uploadFile} />
          </IconButton>
        </Tooltip>
        <IconButton 
          icon={<FaPaperPlane />} 
          size="md" 
          colorScheme="brand" 
          onClick={handleSend}
          isDisabled={!connected || !inputVal.trim()}
          aria-label="Send Message"
        />
      </Flex>

      <InviteModal slug={slug} open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </Flex>
  )
}
