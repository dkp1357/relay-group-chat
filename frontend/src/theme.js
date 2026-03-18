import { extendTheme } from "@chakra-ui/react";

const config = {
  initialColorMode: "dark",
  useSystemColorMode: false,
};

const colors = {
  brand: {
    50: "#e4fbf1",
    100: "#c2f7dc",
    200: "#9cf1c6",
    300: "#70ebb1",
    400: "#49e59f",
    500: "#22df8d",
    600: "#19b371",
    700: "#108554",
    800: "#085837",
    900: "#002d18",
  },
};

const theme = extendTheme({
  config,
  colors,
  fonts: {
    heading: "'IBM Plex Sans', sans-serif",
    body: "'IBM Plex Mono', monospace",
  },
  styles: {
    global: (props) => ({
      body: {
        bg: props.colorMode === "dark" ? "gray.900" : "gray.50",
        color: props.colorMode === "dark" ? "whiteAlpha.900" : "gray.800",
      },
    }),
  },
  components: {
    Button: {
      defaultProps: {
        colorScheme: 'brand',
      },
    },
  },
});

export default theme;
