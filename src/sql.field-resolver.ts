import 'reflect-metadata';
import { PropertyInfo } from '@soapjs/soap';
import { DatabaseType } from './sql.types';
import { SqlTransformers } from './sql.transformers';

/**
 * Field mapping configuration
 */
export interface FieldMappingConfig {
  modelClass?: any;
  modelFieldMappings?: Record<string, PropertyInfo>;
}

/**
 * Resolves field mappings between domain entities and database models
 */
export class SqlFieldResolver<T> {
  private modelClass?: any;
  private modelFieldMappings?: Record<string, PropertyInfo>;
  private databaseType: DatabaseType;

  constructor(config: FieldMappingConfig, databaseType: DatabaseType) {
    this.modelClass = config.modelClass;
    this.modelFieldMappings = config.modelFieldMappings;
    this.databaseType = databaseType;
  }

  /**
   * Resolves field mappings using decorators
   */
  private resolveDecoratorMappings(): Record<string, PropertyInfo> {
    if (!this.modelClass) {
      return {};
    }

    const mappings: Record<string, PropertyInfo> = {};
    const prototype = this.modelClass.prototype;
    
    // Get all property names from the class
    const propertyNames = Object.getOwnPropertyNames(prototype);
    
    for (const propertyName of propertyNames) {
      const metadata = Reflect.getMetadata('sql:field', prototype, propertyName);
      if (metadata) {
        mappings[metadata.domainField || propertyName] = {
          name: propertyName,
          type: metadata.type || 'string',
          transformer: {
            to: metadata.transformer,
            from: metadata.reverseTransformer
          },
          nullable: metadata.nullable
        };
      }
    }

    return mappings;
  }

  /**
   * Gets all field mappings
   */
  getFieldMappings(): Record<string, PropertyInfo> {
    if (this.modelClass) {
      return this.resolveDecoratorMappings();
    }
    
    return this.modelFieldMappings || {};
  }

  /**
   * Gets a specific field mapping
   */
  getFieldMapping(domainField: string): PropertyInfo | undefined {
    const mappings = this.getFieldMappings();
    return mappings[domainField];
  }

  /**
   * Gets the database field name for a domain field
   */
  getDatabaseFieldName(domainField: string): string {
    const mapping = this.getFieldMapping(domainField);
    return mapping?.name || domainField;
  }

  /**
   * Gets the domain field name for a database field
   */
  getDomainFieldName(databaseField: string): string {
    const mappings = this.getFieldMappings();
    
    for (const [domainField, mapping] of Object.entries(mappings)) {
      if (mapping.name === databaseField) {
        return domainField;
      }
    }
    
    return databaseField;
  }

  /**
   * Transforms a domain value to a database value
   */
  transformToDatabase(domainField: string, value: any): any {
    const mapping = this.getFieldMapping(domainField);
    
    if (!mapping) {
      return SqlTransformers.toSql(value, this.databaseType);
    }

    if (mapping.transformer?.to) {
      const transformed = mapping.transformer.to(value);
      return SqlTransformers.toSql(transformed, this.databaseType);
    }

    return SqlTransformers.toSql(value, this.databaseType);
  }

  /**
   * Transforms a database value to a domain value
   */
  transformFromDatabase(domainField: string, value: any): any {
    const mapping = this.getFieldMapping(domainField);
    
    if (!mapping) {
      return SqlTransformers.fromSql(value, this.databaseType);
    }

    const sqlValue = SqlTransformers.fromSql(value, this.databaseType);
    
    if (mapping.transformer?.from) {
      return mapping.transformer.from(sqlValue);
    }

    return sqlValue;
  }

  /**
   * Transforms an entire domain object to a database object
   */
  transformObjectToDatabase(domainObject: any): any {
    const mappings = this.getFieldMappings();
    const databaseObject: any = {};

    for (const [domainField, mapping] of Object.entries(mappings)) {
      if (domainObject.hasOwnProperty(domainField)) {
        const value = domainObject[domainField];
        const transformedValue = this.transformToDatabase(domainField, value);
        
        if (transformedValue !== undefined) {
          databaseObject[mapping.name] = transformedValue;
        }
      }
    }

    return databaseObject;
  }

  /**
   * Transforms an entire database object to a domain object
   */
  transformObjectFromDatabase(databaseObject: any): any {
    const mappings = this.getFieldMappings();
    const domainObject: any = {};

    for (const [domainField, mapping] of Object.entries(mappings)) {
      if (databaseObject.hasOwnProperty(mapping.name)) {
        const value = databaseObject[mapping.name];
        const transformedValue = this.transformFromDatabase(domainField, value);
        
        if (transformedValue !== undefined) {
          domainObject[domainField] = transformedValue;
        }
      }
    }

    return domainObject;
  }

  /**
   * Gets the SQL type for a field
   */
  getSqlType(domainField: string): string {
    const mapping = this.getFieldMapping(domainField);
    if (mapping?.type) {
      return typeof mapping.type === 'string' ? mapping.type : mapping.type.name;
    }
    return 'VARCHAR(255)';
  }

  /**
   * Checks if a field is nullable
   */
  isNullable(domainField: string): boolean {
    const mapping = this.getFieldMapping(domainField);
    return mapping?.nullable ?? true;
  }

  /**
   * Gets the default value for a field
   */
  getDefaultValue(domainField: string): any {
    const mapping = this.getFieldMapping(domainField);
    return mapping?.default;
  }

  /**
   * Validates field mappings
   */
  validateMappings(): string[] {
    const errors: string[] = [];
    const mappings = this.getFieldMappings();

    for (const [domainField, mapping] of Object.entries(mappings)) {
      if (!mapping.name) {
        errors.push(`Field mapping for '${domainField}' is missing database field name`);
      }

      if (!mapping.type) {
        errors.push(`Field mapping for '${domainField}' is missing SQL type`);
      }

      // Check for duplicate database field names
      const duplicateFields = Object.entries(mappings).filter(([_, m]) => m.name === mapping.name);
      if (duplicateFields.length > 1) {
        errors.push(`Duplicate database field name '${mapping.name}' found in mappings`);
      }
    }

    return errors;
  }

    /**
   * Gets field mapping statistics
   */
  getMappingStats(): any {
    const mappings = this.getFieldMappings();
    const totalFields = Object.keys(mappings).length;
    const fieldsWithTransformers = Object.values(mappings).filter(m => m.transformer).length;
    const fieldsWithReverseTransformers = Object.values(mappings).filter(m => m.transformer?.from).length;
    const nullableFields = Object.values(mappings).filter(m => m.nullable).length;
    const fieldsWithDefaults = Object.values(mappings).filter(m => m.default !== undefined).length;

    return {
      totalFields,
      fieldsWithTransformers,
      fieldsWithReverseTransformers,
      nullableFields,
      fieldsWithDefaults,
      mappingMethod: this.modelClass ? 'decorators' : 'manual'
    };
  }

  // Additional methods for compatibility with MongoFieldResolver

  /**
   * Adds a field mapping
   */
  addFieldMapping(entityField: string, propertyInfo: PropertyInfo): void {
    if (!this.modelFieldMappings) {
      this.modelFieldMappings = {};
    }
    this.modelFieldMappings[entityField] = propertyInfo;
  }

  /**
   * Removes a field mapping
   */
  removeFieldMapping(entityField: string): void {
    if (this.modelFieldMappings) {
      delete this.modelFieldMappings[entityField];
    }
  }

  /**
   * Clears all field mappings
   */
  clearFieldMappings(): void {
    this.modelFieldMappings = {};
  }

  /**
   * Checks if a field has a mapping
   */
  hasFieldMapping(fieldName: string): boolean {
    const mappings = this.getFieldMappings();
    return fieldName in mappings;
  }

  /**
   * Gets all property mappings
   */
  getAllPropertyMappings(): Record<string, PropertyInfo> {
    return { ...this.getFieldMappings() };
  }

  /**
   * Resolves a field by its domain name
   */
  resolveByDomainField(domainFieldName: string): PropertyInfo | undefined {
    return this.getFieldMapping(domainFieldName);
  }

  /**
   * Resolves a field by its database name
   */
  resolveByDatabaseField(databaseFieldName: string): PropertyInfo | undefined {
    const mappings = this.getFieldMappings();
    
    for (const [domainField, mapping] of Object.entries(mappings)) {
      if (mapping.name === databaseFieldName) {
        return mapping;
      }
    }
    
    return undefined;
  }

  // Additional methods for SQL-specific functionality

  /**
   * Transforms an entity object to a database document (alias for transformObjectToDatabase)
   */
  transformToDocument(entity: T): Record<string, unknown> {
    return this.transformObjectToDatabase(entity);
  }

  /**
   * Transforms a database document to an entity object (alias for transformObjectFromDatabase)
   */
  transformToEntity(document: Record<string, unknown>): T {
    return this.transformObjectFromDatabase(document);
  }
}

/**
 * Decorator for mapping entity properties to database fields
 */
export function EntityProperty(domainField: string, options: Partial<PropertyInfo> = {}) {
  return function (target: any, propertyKey: string) {
    const metadata = {
      domainField,
      type: options.type || 'string',
      transformer: options.transformer,
      reverseTransformer: options.transformer?.from,
      nullable: options.nullable,
      defaultValue: options.default
    };

    Reflect.defineMetadata('sql:field', metadata, target, propertyKey);
  };
}
