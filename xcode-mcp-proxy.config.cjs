module.exports = {
  apps: [
    {
      name: "xcode-mcp-proxy",
      script: "mcp-proxy",
      args: "--port 9876 -- xcrun mcpbridge",
      interpreter: "none",
      autorestart: true,
      restart_delay: 2000,
      max_memory_restart: "200M",
    },
  ],
};
