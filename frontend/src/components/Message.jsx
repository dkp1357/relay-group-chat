import { Box, Flex, Text, Link, Icon, useColorModeValue, Avatar, Code } from '@chakra-ui/react'
import { FaFileAlt } from 'react-icons/fa'

const COLORS = ['green.500', 'blue.400', 'pink.400', 'orange.400', 'teal.400', 'purple.400']
const colorMap = {}
let ci = 0

function getUserColor(u) {
  if (!colorMap[u]) { colorMap[u] = COLORS[ci % COLORS.length]; ci++ }
  return colorMap[u]
}

function getAvatar(username) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`;
}

export default function Message({ data, isOwn }) {
  const isSystem = data.msg_type === 'system'
  const isFile   = data.msg_type === 'file'
  
  const systemColor = useColorModeValue('gray.500', 'gray.400')
  const textColor = useColorModeValue('gray.800', 'gray.100')
  const userColor = getUserColor(data.username)
  
  const bgOwn = useColorModeValue('brand.50', 'rgba(0, 255, 136, 0.05)')
  const fileBg = useColorModeValue('gray.50', 'gray.700')
  const fileBorder = useColorModeValue('gray.200', 'gray.600')
  const fileHoverBg = useColorModeValue('gray.100', 'gray.600')

  function formatMarkdown(text) {
    if (!text) return null;
    let parts = text.split(/(https?:\/\/[^\s]+|\*\*.*?\*\*|\*.*?\*|`[^`]+`)/g);
    
    return parts.map((part, i) => {
      if (part.match(/^https?:\/\/[^\s]+$/)) {
        return <Link key={i} href={part} color="brand.500" isExternal textDecoration="underline">{part}</Link>
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return <Text as="strong" key={i} fontWeight="bold">{part.slice(2, -2)}</Text>
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <Text as="em" key={i} fontStyle="italic">{part.slice(1, -1)}</Text>
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <Code key={i} colorScheme="pink" fontFamily="mono" fontSize="0.9em" borderRadius="md" px={1}>{part.slice(1, -1)}</Code>
      }
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <Flex 
      gap={3} 
      p={2} 
      borderRadius="md" 
      mt={isSystem ? 1 : 2}
      bg={isOwn && !isSystem ? bgOwn : 'transparent'}
      _hover={{ bg: isOwn && !isSystem ? bgOwn : useColorModeValue('blackAlpha.50', 'whiteAlpha.50') }}
      transition="background 0.2s"
    >
      {!isSystem ? (
        <Box flexShrink={0} mt={1}>
          <Avatar 
            src={getAvatar(data.username)} 
            name={data.username} 
            size="sm" 
            bg={useColorModeValue('gray.100', 'gray.700')}
            border="2px solid" 
            borderColor={userColor} 
          />
        </Box>
      ) : (
        <Box w="32px" flexShrink={0} />
      )}
      
      <Box flex={1} minW={0} pt={0.5}>
        {!isSystem && (
          <Flex align="baseline" gap={2} mb={1}>
            <Text fontSize="sm" fontWeight="bold" color={userColor}>{data.username}</Text>
            <Text fontSize="xs" color={systemColor}>
              {data.timestamp || new Date(data.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </Text>
          </Flex>
        )}
        
        {isFile ? (
          <Link href={data.file_url} isExternal _hover={{ textDecoration: 'none' }}>
            <Flex 
              display="inline-flex" 
              align="center" 
              gap={2} 
              p={2} 
              px={3}
              bg={fileBg} 
              border="1px solid" 
              borderColor={fileBorder} 
              borderRadius="md"
              color="brand.500" 
              fontSize="sm"
              fontFamily="mono" 
              mt={1} 
              transition="all 0.2s"
              _hover={{ borderColor: 'brand.500', bg: fileHoverBg }}
            >
              <Icon as={FaFileAlt} /> {data.filename}
            </Flex>
          </Link>
        ) : (
          <Text
            fontSize={isSystem ? "xs" : "sm"}
            color={isSystem ? systemColor : textColor}
            fontStyle={isSystem ? 'italic' : 'normal'}
            fontFamily={isSystem ? 'mono' : 'body'}
            fontWeight="normal"
            lineHeight="1.6"
            wordBreak="break-word"
          >
            {formatMarkdown(data.content)}
          </Text>
        )}
      </Box>
    </Flex>
  )
}
