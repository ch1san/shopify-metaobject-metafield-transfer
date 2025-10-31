const axios = require('axios');
let envConfig = require('dotenv').config();
const parseArgs = require('minimist');
const fs = require('fs');
const path = require('path');
const csv = require('csv');
const {parse}  = require('csv-parse');
const {transform} = require('stream-transform');

if (!envConfig.error) {
  envConfig = envConfig.parsed;
}

const args = parseArgs(process.argv);
const env = args.env ? args.env : 'production'
const apiVersion = '2023-10';
const shop = envConfig[`SHOPIFY_${env.toUpperCase()}_STORE`];
const graphToken = envConfig[`SHOPIFY_${env.toUpperCase()}_PASS`];



// const csvName = 'product-sample-icons'; // variable
const csvName = 'products-20240112'; // variable
const metaObjectType = 'care_icons'; // variable just the handle e.g. care_icons

const shopifyFileName = path.resolve(`./tools/metaObject/${csvName}.csv`);
const shopifyNewFileName = path.resolve(`./tools/metaObject/${csvName}-NEW.csv`);

const getMetaObjectForType = (type) => `query getMeta($cursor:String) {
    metaobjects(first: 10, type: "${type}", after: $cursor) {
      nodes {
        id
        handle
        type
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }`;

let listMetaObjects = {}

const getMetaObjects = async (type, cursor = '') => {
  console.log('Getting Metafields.');

  let body = {
    query: getMetaObjectForType(type)
  };
  if (cursor.length > 0) {
    body = {...body, variables: {"cursor": cursor}}
  }
  return axios.post(
    'https://' + shop + '/admin/api/' + apiVersion + '/graphql.json', 
    body,
    {
      'headers': {
        'X-Shopify-Access-Token': graphToken
      },
    }
  )
  .then(async (res) => {
    // console.log(res.data)
    const graphData = res.data.data.metaobjects
    let metaFields = graphData.nodes;
    metaFields.forEach(m => {
      listMetaObjects = {
        ...listMetaObjects,
        [`${m.type}.${m.handle}`]: m.id
      }
    })
    if (graphData.pageInfo.hasNextPage) {
      return getMetaObjects(metaObjectType, graphData.pageInfo.endCursor)
    } else {
      console.log('MetaObjects All Prepped')
    }

  })
  .catch(e => {
    console.error(e);
    return false;
  })
};


// const writeStream = fs.createWriteStream(shopifyNewFileName, {flags:'a'});
const writeStream = fs.createWriteStream(shopifyNewFileName);
const parser = parse({});
const columnNumber = 59;

const cutOffArchivedDate = new Date('2023-04-01')

const content = fs.readFileSync(path.join(__dirname, 'combinedData', 'combinedCountryData.json'), 'utf8')
const parsedCountry = JSON.parse(content)

const transformer = transform(async (record, callback) => {

  if (record[12].length > 0 ) {
    // remove specific records https://blubolt.slack.com/archives/C06BG8KR283/p1704303531671769
    if (record[14] === 'Draft' && record[11] === '0' && record[12].indexOf('2023') === -1) {
      // console.log(record)
      callback(null, null);
      return;
    }
    const lastOrderDate = new Date(record[13])
    // remove specific records https://blubolt.slack.com/archives/C06BG8KR283/p1704303531671769
    if (record[14] === 'Archived' && lastOrderDate < cutOffArchivedDate) {
      console.log(record)
      callback(null, null);
      return;
    }
  }

  if (record[columnNumber].indexOf(`care_icon.`) >= 0) {
    console.log('START', record[columnNumber], 'Transform')
    const newMetaObjItems = record[columnNumber].split(',').map(mo => mo.replace('care_icon.','care_icons.').trim())
    let newMetaObjRef = [...new Set(newMetaObjItems)]
    console.log(newMetaObjRef)
    newMetaObjRef = newMetaObjRef.map(mo => listMetaObjects[mo]).join(',');
    if (newMetaObjRef) {
      console.log(newMetaObjRef)
      record[columnNumber] = newMetaObjRef
    }
  }
  // ensure data for bodyhtml is not affected
  [4,5].forEach(i => {
    if (record[i].length > 0 && record[i].indexOf('"') >= 0) {
      record[i] = record[i].replace(/"/g,'""')
    }
  })
  if (record[44].length > 0 && parsedCountry[record[44]]) {
    record[45] = parsedCountry[record[44]]
  }
  if (record[57].length > 0) {
    record[57] = `[""${record[57].replace(/"/g,'""').replace(/\n/g,'"",""')}""]`
  }
  [52,53,58].forEach(i => {
    // console.log(record[i])
    if (record[i].indexOf('[') !== -1) {
      record[i] = record[i].replace(/"/g,'""').replace(']','""]')
    }
    // console.log(record[i])
  })
  if (record[54].length > 0) {
    record[54] = `[""${record[54].replace(/"/g,'""').replace(/\n/g,'"",""')}""]`
  }
  if (record[60].length > 0 && record[60].indexOf('Metafield') === -1) {
    record[60] = `the_kidly_view.${record[60]}`
  }
  record = record.map(v => v === 'NULL' ? '' : v)
  console.log(record)
  // const newData = [];
  // [0,1,2,54].forEach(i => {
  //   newData.push(record[i])
  // })
  // callback(null, `"${newData.join('","')}"\n`);
  callback(null, `"${record.join('","')}"\n`);
}, {
  parallel: 1
});

// Read CSV 1
const readShopifyFile = (callback) => {
  const readStream = fs.createReadStream(shopifyFileName, 'utf8');
  console.log('started')
  readStream
    .pipe(parser)
    .pipe(transformer)
    .pipe(writeStream)
    .on('end', () => {
      console.log('finished')
      callback()
    });
}


const processData = async () => {
  await getMetaObjects(metaObjectType);
  console.log('linked meta objects', listMetaObjects)
  readShopifyFile(() => {
    // writeStream.end();
    console.log('end')
  })
}
processData()

