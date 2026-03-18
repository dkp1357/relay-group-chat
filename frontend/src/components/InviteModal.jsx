import { useState } from 'react'
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Input,
  Flex,
  Text,
  useClipboard
} from '@chakra-ui/react'

export default function InviteModal({ slug, open, onClose }) {
  const url = slug ? `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(slug)}` : ''
  const { hasCopied, onCopy } = useClipboard(url)

  return (
    <Modal isOpen={open} onClose={onClose} isCentered motionPreset="slideInBottom">
      <ModalOverlay backdropFilter="blur(10px)" bg="blackAlpha.300" />
      <ModalContent bg="var(--chakra-colors-chakra-body-bg)" maxW="md">
        <ModalHeader mb={0} pb={2} fontSize="lg" fontWeight="bold">Invite to room</ModalHeader>
        <ModalCloseButton />
        <ModalBody pt={0}>
          <Text fontSize="sm" color="gray.500" mb={4}>
            Share this link — anyone with it can join instantly.
          </Text>
          <Flex gap={2}>
            <Input 
              isReadOnly 
              value={url} 
              fontFamily="mono" 
              fontSize="sm" 
              color="brand.500"
              bg="var(--chakra-colors-chakra-body-bg)"
            />
            <Button 
              onClick={onCopy} 
              colorScheme={hasCopied ? 'yellow' : 'brand'} 
              color={hasCopied ? 'gray.900' : 'white'}
              minW="100px"
              fontWeight="bold"
            >
              {hasCopied ? 'Copied!' : 'Copy'}
            </Button>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
