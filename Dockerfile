FROM nginx:alpine
COPY . /usr/share/nginx/html
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80 3000
CMD ["nginx", "-g", "daemon off;"]
