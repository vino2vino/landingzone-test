/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as accelerator_constructs from '@aws-accelerator/constructs';
import * as ssm from '@aws-cdk/aws-ssm';
import * as cdk from '@aws-cdk/core';
import { pascalCase } from 'change-case';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class NetworkTgwStack extends AcceleratorStack {
  constructor(scope: cdk.Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    new ssm.StringParameter(this, 'SsmParamStackId', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/stack-id`,
      stringValue: cdk.Stack.of(this).stackId,
    });

    //
    // Generate Transit Gateways
    //
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      const accountId = props.accountIds[props.accountsConfig.getEmail(tgwItem.account)];
      if (accountId === cdk.Stack.of(this).account && tgwItem.region == cdk.Stack.of(this).region) {
        console.log('Add Transit Gateway');
        const tgw = new accelerator_constructs.TransitGateway(this, pascalCase(`${tgwItem.name}TransitGateway`), {
          name: tgwItem.name,
          amazonSideAsn: tgwItem.asn,
          autoAcceptSharedAttachments: tgwItem.autoAcceptSharingAttachments,
          defaultRouteTableAssociation: tgwItem.defaultRouteTableAssociation,
          defaultRouteTablePropagation: tgwItem.defaultRouteTablePropagation,
          dnsSupport: tgwItem.dnsSupport,
          vpnEcmpSupport: tgwItem.vpnEcmpSupport,
        });

        new ssm.StringParameter(this, pascalCase(`SsmParam${tgwItem.name}TransitGatewayId`), {
          parameterName: `/accelerator/network/transitGateways/${tgwItem.name}/id`,
          stringValue: tgw.transitGatewayId,
        });

        console.log('Add Transit Gateway Route Tables');
        for (const routeTableItem of tgwItem.routeTables ?? []) {
          console.log(`Adding Transit Gateway Route Table: ${routeTableItem.name}`);

          const routeTable = new accelerator_constructs.TransitGatewayRouteTable(
            this,
            pascalCase(`${routeTableItem.name}TransitGatewayRouteTable`),
            {
              transitGatewayId: tgw.transitGatewayId,
              name: routeTableItem.name,
            },
          );

          new ssm.StringParameter(
            this,
            pascalCase(`SsmParam${tgwItem.name}${routeTableItem.name}TransitGatewayRouteTableId`),
            {
              parameterName: `/accelerator/network/transitGateways/${tgwItem.name}/routeTables/${routeTableItem.name}/id`,
              stringValue: routeTable.id,
            },
          );
        }

        console.log('Share Transit Gateway');
        if (tgwItem.deploymentTargets) {
          // Build a list of principals to share to
          const principals: string[] = [];

          // Loop through all the defined OUs
          for (const ou of tgwItem.deploymentTargets.organizationalUnits ?? []) {
            const arn = props.organizationalUnitIds[ou].arn;
            console.log(`Share Transit Gateway ${tgwItem.name} with Organizational Unit ${ou}: ${arn}`);
            principals.push(arn);
          }

          // Loop through all the defined accounts
          for (const account of tgwItem.deploymentTargets.accounts ?? []) {
            const accountId = props.accountIds[props.accountsConfig.getEmail(account)];
            console.log(`Share Transit Gateway ${tgwItem.name} with Account ${account}: ${accountId}`);
            principals.push(accountId);
          }

          // Create the Resource Share
          new accelerator_constructs.ResourceShare(this, pascalCase(`${tgwItem.name}TransitGatewayShare`), {
            name: `${tgwItem.name}TransitGatewayShare`,
            principals,
            resourceArns: [tgw.transitGatewayArn],
          });
        }
      }
    }
  }
}