# For token-filter
cp dockerfile-template services/token-filter/Dockerfile
sed -i 's/SERVICE_NAME/token-filter/g' services/token-filter/Dockerfile

# For buy-executor
cp dockerfile-template services/buy-executor/Dockerfile
sed -i 's/SERVICE_NAME/buy-executor/g' services/buy-executor/Dockerfile

# For sell-manager
cp dockerfile-template services/sell-manager/Dockerfile
sed -i 's/SERVICE_NAME/sell-manager/g' services/sell-manager/Dockerfile

# For api-server
cp dockerfile-template services/api-server/Dockerfile
sed -i 's/SERVICE_NAME/api-server/g' services/api-server/Dockerfile