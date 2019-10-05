import amqplib from 'amqplib';

export default class AMQPBackend {
  /**
   * AMQP backend class
   * @constructor AMQPBackend
   * @param {object} opts the options object for amqp connect of amqplib
   */
  constructor(opts) {
    this.connect = amqplib.connect(opts);
    this.channel = this.connect
      .then(conn => conn.createChannel())
      .then(ch => ch.assertExchange('default', 'direct', {
        durable: true,
        autoDElete: true,
        internal: false,
        nowait: false,
        arguments: null,
      }).then(() => Promise.resolve(ch)));
  }

  /**
   * @method AMQPBackend#isReady
   * @returns {Promise} promises that continues if amqp connected.
   */
  isReady() {
    return this.connect;
  }

  /**
   * @method AMQPBackend#disconnect
   * @returns {Promise} promises that continues if amqp disconnected.
   */
  disconnect() {
    return this.connect.then(conn => conn.close());
  }

  /**
   * store result method on backend
   * @method AMQPBackend#storeResult
   * @param {String} taskId
   * @param {*} result result of task. i.e the return value of task handler
   * @param {String} state
   * @returns {Promise}
   */
  storeResult(taskId, result, state) {
    const queue = taskId.replace(/-/g, '');
    return this.channel
      .then(ch => ch.assertQueue(queue, {
        durable: true,
        autoDelete: true,
        exclusive: false,
        nowait: false,
        arguments: {
          'x-expires': 86400000,
        },
      }).then(() => Promise.resolve(ch)))
      .then(ch => ch.publish('', queue, Buffer.from(JSON.stringify({
        status: state,
        result,
        traceback: null,
        children: [],
        task_id: taskId,
        date_done: new Date().toISOString(),
      })), {
        contentType: 'application/json',
        contentEncoding: 'utf-8',
      }));
  }

  /**
   * get result data from backend
   * @method AMQPBackend#getTaskMeta
   * @param {String} taskId
   * @returns {Promise}
   */
  getTaskMeta(taskId) {
    const queue = taskId.replace(/-/g, '');
    return this.channel
      .then(ch => ch.assertQueue(queue, {
        durable: true,
        autoDelete: true,
        exclusive: false,
        nowait: false,
        arguments: {
          'x-expires': 86400000,
        },
      }).then(() => Promise.resolve(ch)))
      .then(ch => ch.get(queue, {
        noAck: false,
      }))
      .then((msg) => {
        if (msg.properties.contentType !== 'application/json') {
          throw new Error(`unsupported content type ${msg.properties.contentType}`);
        }

        if (msg.properties.contentEncoding !== 'utf-8') {
          throw new Error(`unsupported content encoding ${msg.properties.contentEncoding}`);
        }

        const body = msg.content.toString('utf-8');
        return JSON.parse(body);
      });
  }
}