'use strict';
const DynamoDB = require("aws-sdk/clients/dynamodb");
const EventBridge = require("aws-sdk/clients/eventbridge");
const documentClient = new DynamoDB.DocumentClient({ region: 'us-east-1' });
const NOTES_TABLE_NAME = process.env.NOTES_TABLE_NAME;
const eventBridge = new EventBridge({ region: 'us-east-1' });
const EVENT_BUS_NAME = process.env.EventBusName;

const send = (statusCode, data) => {
  return {
    statusCode,
    body: JSON.stringify(data)
  }
}
module.exports.createNote = async (event, context, cb) => {
  let data = JSON.parse(event.body);
  try {
    const params = {
      TableName: NOTES_TABLE_NAME,
      Item: {
        noteId: data.id,
        title: data.title,
        body: data.body
      },
      ConditionExpression: "attribute_not_exists(noteId)"
    }
    await documentClient.put(params).promise();

    // send event
    const eventParams = {
      Entries: [
        {
          Source: 'notes-app',
          DetailType: 'note-created',
          Detail: JSON.stringify(data),
          EventBusName: EVENT_BUS_NAME
        }
      ]
    }
    await eventBridge.putEvents(eventParams).promise();


    cb(null, send(201, data));
  } catch (err) {
    cb(null, send(500, err.message));
  }
};

// Path: notes/handler.js
module.exports.processEvent = async (even) => {
  console.log('Event: ', even);
  let batchItemFailures = [];
  let records = even.Records;
  for (let record of records) {
    let event = JSON.parse(record.body);
    console.log('Event: ', event);
    try {
      const parsedBody = JSON.parse(record.body);

      console.log("processing note details for " + parsedBody.detail.id);
      console.log("processing is successful " + record.messageId);
    } catch (err) {
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  return { batchItemFailures };

}


module.exports.updateNote = async (event, context, cb) => {
  let noteId = event.pathParameters.id;
  let data = JSON.parse(event.body);
  try {
    const params = {
      TableName: NOTES_TABLE_NAME,
      Key: { noteId },
      UpdateExpression: 'set #title = :title, #body = :body',
      ExpressionAttributeNames: {
        '#title': 'title',
        '#body': 'body'
      },
      ExpressionAttributeValues: {
        ':title': data.title,
        ':body': data.body
      },
      ConditionExpression: 'attribute_exists(noteId)'
    }
    await documentClient.update(params).promise();
    cb(null, send(200, data))

  } catch (err) {
    cb(null, send(500, err.message));
  }
};

module.exports.deleteNote = async (event, context, cb) => {
  let noteId = event.pathParameters.id;
  try {
    const params = {
      TableName: NOTES_TABLE_NAME,
      Key: { noteId },
      ConditionExpression: 'attribute_exists(noteId)'
    }
    await documentClient.delete(params).promise();
    cb(null, send(200, noteId));

  } catch (err) {
    cb(null, send(500, err.message));
  }
};

module.exports.getAllNotes = async (event, context, cb) => {
  try {
    const params = {
      TableName: NOTES_TABLE_NAME
    }
    const notes = await documentClient.scan(params).promise();
    cb(null, send(200, notes));

  } catch (err) {
    cb(null, send(500, err.message));
  }
};

module.exports.getNote = async (ev, ctx, cb) => {
  let noteId = ev.pathParameters.id;
  try {
    const params = {
      TableName: NOTES_TABLE_NAME,
      KeyConditionExpression : 'noteId = :noteId',
      ExpressionAttributeValues: {
        ':noteId': noteId,
      }, Limit: 1,
    }
    const note = await documentClient.query(params).promise();
    cb(null, send(200, note));
  } catch (error) {
    cb(null, send(500, error.message));
  }
}
