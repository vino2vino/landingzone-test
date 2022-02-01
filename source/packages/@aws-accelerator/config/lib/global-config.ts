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

import * as t from './common-types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Global configuration items.
 */
export abstract class GlobalConfigTypes {
  static readonly controlTowerConfig = t.interface({
    enable: t.boolean,
  });

  static readonly cloudtrailConfig = t.interface({
    enable: t.boolean,
    organizationTrail: t.boolean,
  });

  static readonly loggingConfig = t.interface({
    account: t.nonEmptyString,
    cloudtrail: GlobalConfigTypes.cloudtrailConfig,
  });

  static readonly identityPerimeterConfig = t.interface({
    enable: t.boolean,
  });

  static readonly resourcePerimeterConfig = t.interface({
    enable: t.boolean,
  });

  static readonly networkPerimeterConfig = t.interface({
    enable: t.boolean,
  });

  static readonly dataProtectionConfig = t.interface({
    enable: t.boolean,
    identityPerimeter: this.identityPerimeterConfig,
    resourcePerimeter: this.resourcePerimeterConfig,
    networkPerimeter: this.networkPerimeterConfig,
  });

  static readonly globalConfig = t.interface({
    homeRegion: t.nonEmptyString,
    enabledRegions: t.array(t.region),
    managementAccountAccessRole: t.nonEmptyString,
    controlTower: GlobalConfigTypes.controlTowerConfig,
    logging: GlobalConfigTypes.loggingConfig,
    dataProtection: t.optional(GlobalConfigTypes.dataProtectionConfig),
  });
}

export class ControlTowerConfig implements t.TypeOf<typeof GlobalConfigTypes.controlTowerConfig> {
  readonly enable = true;
}

export class CloudtrailConfig implements t.TypeOf<typeof GlobalConfigTypes.cloudtrailConfig> {
  readonly enable = false;
  readonly organizationTrail = false;
}

export class LoggingConfig implements t.TypeOf<typeof GlobalConfigTypes.loggingConfig> {
  readonly account = 'Log Archive';
  readonly cloudtrail: CloudtrailConfig = new CloudtrailConfig();
}

export class IdentityPerimeterConfig implements t.TypeOf<typeof GlobalConfigTypes.identityPerimeterConfig> {
  readonly enable = true;
}

export class ResourcePerimeterConfig implements t.TypeOf<typeof GlobalConfigTypes.resourcePerimeterConfig> {
  readonly enable = true;
}

export class NetworkPerimeterConfig implements t.TypeOf<typeof GlobalConfigTypes.networkPerimeterConfig> {
  readonly enable = true;
}

export class DataProtectionConfig implements t.TypeOf<typeof GlobalConfigTypes.dataProtectionConfig> {
  readonly enable = true;
  readonly identityPerimeter = new IdentityPerimeterConfig();
  readonly resourcePerimeter = new ResourcePerimeterConfig();
  readonly networkPerimeter = new NetworkPerimeterConfig();
}

export class GlobalConfig implements t.TypeOf<typeof GlobalConfigTypes.globalConfig> {
  static readonly FILENAME = 'global-config.yaml';

  readonly homeRegion = '';
  readonly enabledRegions = [];

  /**
   * This role trusts the management account, allowing users in the management
   * account to assume the role, as permitted by the management account
   * administrator. The role has administrator permissions in the new member
   * account.
   *
   * Examples:
   * - AWSControlTowerExecution
   * - OrganizationAccountAccessRole
   */
  readonly managementAccountAccessRole = 'AWSControlTowerExecution';

  readonly controlTower: ControlTowerConfig = new ControlTowerConfig();
  readonly logging: LoggingConfig = new LoggingConfig();

  readonly dataProtection: DataProtectionConfig | undefined = undefined;

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof GlobalConfigTypes.globalConfig>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   * Load from file in given directory
   * @param dir
   * @returns
   */
  static load(dir: string): GlobalConfig {
    const buffer = fs.readFileSync(path.join(dir, GlobalConfig.FILENAME), 'utf8');
    const values = t.parse(GlobalConfigTypes.globalConfig, yaml.load(buffer));
    return new GlobalConfig(values);
  }

  /**
   * Load from string content
   * @param content
   */
  static loadFromString(content: string): GlobalConfig | undefined {
    try {
      const values = t.parse(GlobalConfigTypes.globalConfig, yaml.load(content));
      return new GlobalConfig(values);
    } catch (e) {
      console.log('[global-config] Error parsing input, global config undefined');
      console.log(`${e}`);
      return undefined;
    }
  }
}
