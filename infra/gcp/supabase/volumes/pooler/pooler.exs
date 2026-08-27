import Config

config :supavisor,
  # Port for tenant clients
  proxy_port: 6543,
  # Metrics port
  metrics_port: 9095,
  # Manager / admin port
  api_port: 4000

config :supavisor, Supavisor.Repo,
  adapter: Ecto.Adapters.Postgres,
  pool_size: 10
