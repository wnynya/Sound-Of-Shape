'use strict';

import EventEmitter from '/eventemitter.mjs';

class WebSocketClient extends EventEmitter {
  constructor(uri, options = {}) {
    super();

    this.uri = uri;

    options.autoReconnect = options.autoReconnect
      ? options.autoReconnect
      : false;
    this.options = options;

    this.connection = null;
    this.connected = false;
    this.closed = false;

    this.pingInterval = null;
    this.setPingInterval = () => {
      this.pingInterval = setInterval(() => {
        if (this.connection && this.connected) {
          this.connection.send('PING');
        }
      }, 1000 * 2);
    };
    this.clearPingInterval = () => {
      clearInterval(this.pingInterval);
    };

    this.reconnectInterval = null;
    this.setReconnectInterval = () => {
      this.reconnectInterval = setInterval(() => {
        if (this.options.autoReconnect && !this.connected && !this.closed) {
          this.open();
        }
      }, 1000 * 2);
    };
    this.clearReconnectInterval = () => {
      clearInterval(this.reconnectInterval);
    };
  }

  open() {
    if (this.connection || this.connected) {
      return;
    }
    this.closed = false;

    try {
      this.connection = new WebSocket(this.uri);
      this.addEventListener();
    } catch (error) {
      throw error;
    }
  }

  addEventListener() {
    this.connection.onopen = (event) => {
      this.connected = true;
      this.clearReconnectInterval();
      this.setPingInterval();
      this.emit('open', event);
    };

    this.connection.onmessage = (event) => {
      this.emit('message', event);
      const text = event.data;
      try {
        const object = JSON.parse(text);
        this.emit('json', this, object.event, object.data, object.message);
        this.emit('text', this, text);
      } catch (error) {
        this.emit('text', this, text);
      }
    };

    this.connection.onclose = (event) => {
      this.connected = false;
      this.clearPingInterval();
      this.setReconnectInterval();
      delete this.connection;
      this.emit('close', event);
    };

    this.connection.onerror = (event) => {
      this.emit('error', event);
    };
  }

  close() {
    this.closed = true;
    this.connection ? this.connection.close() : null;
  }

  send(message) {
    if (!this.connection) {
      return;
    }
    if (typeof message == 'object') {
      message = JSON.stringify(message);
    }
    this.connection.send(message);
  }

  event(name, data, message = name) {
    this.send({
      event: name,
      message: message,
      data: data,
    });
  }
}

export default WebSocketClient;
