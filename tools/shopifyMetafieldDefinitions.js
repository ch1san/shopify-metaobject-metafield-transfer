const axios = require('axios');
let envConfig = require('dotenv').config();
const parseArgs = require('minimist');

if (!envConfig.error) {
  envConfig = envConfig.parsed;
}

const args = parseArgs(process.argv);
const env = args.env ? args.env : 'development';
const apiVersion = '2023-04';
const shop = envConfig[`SHOPIFY_${env.toUpperCase()}_STORE`];
const graphToken = envConfig[`SHOPIFY_${env.toUpperCase()}_PASS`];

const newShop = envConfig[`SHOPIFY_COPY_${env.toUpperCase()}_STORE`];
const newGraphToken = envConfig[`SHOPIFY_COPY_${env.toUpperCase()}_PASS`];

// npm run copy:metafields -- --env=production

const failedToCreate = [];
const metaObjectsMapping = [];

const prepMetaObjects = async () => {
  const getMetaObjectsQuery = `{
    metaobjectDefinitions(first:100) {
      edges {
        node {
          id
          type
        }
      }
    }
  }`;

  return axios
    .post(
      'https://' + shop + '/admin/api/' + apiVersion + '/graphql.json',
      {
        query: getMetaObjectsQuery,
      },
      {
        headers: {
          'X-Shopify-Access-Token': graphToken,
        },
      }
    )
    .then((res) => {
      // console.log('from shop defs')
      // console.log(res.data)
      // console.log(res.data.data.metaobjectDefinitions)
      if (!res.data.data) {
        return false;
      }
      res.data.data.metaobjectDefinitions.edges.forEach((m) => {
        metaObjectsMapping.push({
          type: m.node.type,
          from: m.node.id,
          to: '',
        });
      });
      // console.log(metaObjectsMapping)
      return axios
        .post(
          'https://' + newShop + '/admin/api/' + apiVersion + '/graphql.json',
          {
            query: getMetaObjectsQuery,
          },
          {
            headers: {
              'X-Shopify-Access-Token': newGraphToken,
            },
          }
        )
        .then((res) => {
          // console.log('to shop defs')
          // console.log(res.data.data.metaobjectDefinitions)
          res.data.data.metaobjectDefinitions.edges.forEach((m) => {
            const curObjIndex = metaObjectsMapping.findIndex((mo) => mo.type === m.node.type);
            if (curObjIndex >= 0) {
              metaObjectsMapping[curObjIndex] = {
                ...metaObjectsMapping[curObjIndex],
                to: m.node.id,
              };
            } else {
              metaObjectsMapping.push({
                type: m.node.type,
                from: '',
                to: m.node.id,
              });
            }
          });
          // console.log(metaObjectsMapping)
          return metaObjectsMapping;
        });
    })
    .catch((e) => {
      console.log('error');
      console.error(e.data);
      console.error(e);
      return false;
    });
};

const createMetaField = (newMetafieldDefinition) => {
  // console.log('Creating Metafield.');
  // console.log(newMetafieldDefinition);

  const createMetafieldMutation = `mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        name
      }
      userErrors {
        field
        message
        code
      }
    }
  }`;
  const body = {
    query: createMetafieldMutation,
    variables: newMetafieldDefinition,
  };
  axios
    .post('https://' + newShop + '/admin/api/' + apiVersion + '/graphql.json', body, {
      headers: {
        'X-Shopify-Access-Token': newGraphToken,
      },
    })
    .then((res) => {
      if (res.data.data.metafieldDefinitionCreate?.userErrors[0]?.code === 'TAKEN') {
        console.log(`${newMetafieldDefinition.definition.name} already exists`);
      } else {
        console.error(`!Error ${newMetafieldDefinition.definition.name}`);
        if (res.data.data.metafieldDefinitionCreate?.userErrors.length > 0) {
          console.error(JSON.stringify(res.data.data.metaobjectDefinitionCreate.userErrors));
        }
      }
    })
    .catch((e) => {
      console.log('error');
      console.error(e.data);
      console.error(e);
      return false;
    });
};

const getMetafieldsQuery = (type) => `query getMeta($cursor:String) {
  metafieldDefinitions(first: 1, ownerType: ${type}, after: $cursor) {
      edges {
        node {
          namespace
          key
          description
          name
          ownerType
          type {
            name
          }
          validations {
            name
            value
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }`;

const metaTypes = ['ARTICLE', 'BLOG', 'COLLECTION', 'COMPANY', 'COMPANY_LOCATION', 'CUSTOMER', 'LOCATION', 'MARKET', 'ORDER', 'PAGE', 'PRODUCT', 'PRODUCTVARIANT', 'SHOP'];

const getMetaFields = (type, cursor = '') => {
  console.log('Getting Metafields.');

  let body = {
    query: getMetafieldsQuery(type),
  };
  if (cursor.length > 0) {
    body = { ...body, variables: { cursor: cursor } };
  }
  axios
    .post('https://' + shop + '/admin/api/' + apiVersion + '/graphql.json', body, {
      headers: {
        'X-Shopify-Access-Token': graphToken,
      },
    })
    .then((res) => {
      console.log(res.data);
      const graphData = res.data.data.metafieldDefinitions;
      let metaFields = graphData.edges;
      metaFields.map((m) => {
        let newDef = { definition: m.node };
        newDef.definition = { ...newDef.definition, type: newDef.definition.type.name };
        // metafield object links don't work - as have diff ids
        newDef.definition.validations = newDef.definition.validations.map((v) => {
          if (v.name === 'metaobject_definition_id') {
            const foundMetaObject = metaObjectsMapping.find((mo) => mo.from === v.value);
            console.log('mo', foundMetaObject);
            return {
              name: 'metaobject_definition_id',
              value: foundMetaObject.to || v.value,
            };
          } else {
            return v;
          }
        });
        // console.log(JSON.stringify(newDef.definition.validations))
        createMetaField(newDef);
      });
      if (graphData.pageInfo.hasNextPage) {
        getMetaFields(type, graphData.pageInfo.endCursor);
      } else {
        console.log(type, 'ISSUES');
        console.log(failedToCreate);
        console.log(type, 'END');
        if (metaTypes.length > 0) {
          // next list of elements
          const nextType = metaTypes.shift();
          console.log(nextType, 'BEGIN');
          getMetaFields(nextType);
        }
      }
    })
    .catch((e) => {
      console.error(e);
      return false;
    });
};

const processData = async () => {
  await prepMetaObjects();
  console.log('linked meta objects', metaObjectsMapping);
  getMetaFields(metaTypes.shift());
};
processData();
